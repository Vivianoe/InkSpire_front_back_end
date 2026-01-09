'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { Checkbox, Field, Label } from '@headlessui/react'
import { useAuth } from '@/contexts/AuthContext'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  allowClose?: boolean
}

interface PerusallCourse {
  _id: string
  name: string
}

type Step = 'set-credentials' | 'validate-credentials' | 'select-courses' | 'import-courses' | 'complete-integration'

export function AuthModal({ isOpen, onClose, allowClose = false }: AuthModalProps) {
  const { triggerCoursesRefresh } = useAuth()
  const [step, setStep] = useState<Step>('set-credentials')
  const [institutionId, setInstitutionId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [showApiToken, setShowApiToken] = useState(false)
  const [courses, setCourses] = useState<PerusallCourse[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [importedCourseIds, setImportedCourseIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [closeTimeoutId, setCloseTimeoutId] = useState<NodeJS.Timeout|null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutId) {
        clearTimeout(closeTimeoutId)
      }
    }
  }, [closeTimeoutId])

  // Reset modal to initial state when closed
  useEffect(() => {
    if (!isOpen) {
      // Reset to initial step
      setStep('set-credentials')
      // Clear error state
      setError(null)
      // Clear temporary data
      setCourses([])
      setSelectedCourseIds([])
      setImportedCourseIds([])
      // Note: We keep institutionId and apiToken in case user reopens for settings
    }
  }, [isOpen])

  // Helper function to get authorization headers
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Not authenticated. Please sign in again.')
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    }
  }

  const handleValidateCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('validate-credentials')
    setError(null)

    try {
      // Get auth headers
      const headers = await getAuthHeaders()

      // Step 1: Validate Perusall credentials
      const authResponse = await fetch('/api/perusall/authenticate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          institution_id: institutionId,
          api_token: apiToken
        })
      })

      if (!authResponse.ok) {
        const data = await authResponse.json()
        throw new Error(data.detail || 'Failed to validate Perusall credentials')
      }

      // Step 2: Fetch Perusall courses
      const coursesResponse = await fetch('/api/perusall/courses', {
        method: 'GET',
        headers
      })

      if (!coursesResponse.ok) {
        const data = await coursesResponse.json()
        const errorDetail = data.detail || 'Failed to fetch Perusall courses'

        // Provide helpful hints based on error type
        let errorMessage = errorDetail
        if (errorDetail.includes('Invalid Perusall credentials')) {
          errorMessage += '\n\nPlease check:\n• Institution ID is correct\n• API Token has not expired'
        } else if (errorDetail.includes('access forbidden') || errorDetail.includes('expired or been revoked')) {
          errorMessage += '\n\nYour API Token may have been revoked. Please generate a new one from Perusall.'
        } else if (errorDetail.includes('Invalid credential format')) {
          errorMessage += '\n\nPlease ensure your credentials are properly formatted.'
        }

        throw new Error(errorMessage)
      }

      const coursesData = await coursesResponse.json()
      setCourses(coursesData.courses || [])

      // Fetch user's existing courses to identify which Perusall courses are already imported
      try {
        // Step 1: Get internal user ID from /api/users/me
        const userResponse = await fetch('/api/users/me', { headers })
        if (!userResponse.ok) {
          console.error('Failed to fetch user info')
          // Continue to course selection even if this fails
        } else {
          const userData = await userResponse.json()

          // Step 2: Use internal ID to fetch courses
          const userCoursesResponse = await fetch(`/api/courses/instructor/${userData.id}`, {
            method: 'GET',
            headers
          })

          if (userCoursesResponse.ok) {
            const userCoursesData = await userCoursesResponse.json()
            // Extract Perusall course IDs from courses that have been imported
            const imported = userCoursesData.courses
              .filter((c: any) => c.perusall_course_id)
              .map((c: any) => c.perusall_course_id)
            setImportedCourseIds(imported)
            // Pre-select already imported courses
            setSelectedCourseIds(imported)
          }
        }
      } catch (err) {
        console.error('Failed to fetch user courses:', err)
        // Continue to course selection even if this fails
      }

      setStep('select-courses')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStep('set-credentials')
    }
  }

  const handleCourseSelection = (courseId: string) => {
    // Don't allow toggling imported courses
    if (importedCourseIds.includes(courseId)) return

    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  const handleImportCourses = async () => {
    // Filter out already imported courses
    const newCoursesToImport = selectedCourseIds.filter(id => !importedCourseIds.includes(id))

    if (newCoursesToImport.length === 0) {
      setError('Please select at least one course to import')
      return
    }

    setStep('import-courses')
    setError(null)

    try {
      // Get auth headers
      const headers = await getAuthHeaders()

      const response = await fetch('/api/perusall/import-courses', {
        method: 'POST',
        headers,
        body: JSON.stringify({ course_ids: newCoursesToImport })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to import courses')
      }

      setStep('complete-integration')

      // Refresh courses on dashboard
      triggerCoursesRefresh()

      // Auto-close after 2 second and trigger dashboard refresh
      const timeoutId = setTimeout(() => {
        onClose()
      }, 2000)
      setCloseTimeoutId(timeoutId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStep('select-courses')
    }
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 ${allowClose ? 'bg-black bg-opacity-60 backdrop-blur-sm' : 'bg-black'} flex items-center justify-center z-[9999]`}>
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {step === 'set-credentials' && 'Connect to Perusall'}
            {step === 'validate-credentials' && 'Validating Credentials...'}
            {step === 'select-courses' && 'Select Courses to Import'}
            {step === 'import-courses' && 'Importing Courses...'}
            {step === 'complete-integration' && 'Integration Complete!'}
          </h2>
          {/* Show close button if allowClose is true OR in development mode */}
          {(allowClose || process.env.NODE_ENV === 'development') && (
            <button
              onClick={onClose}
              className="text-2xl text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        {/* Step 1: Credentials Input */}
        {step === 'set-credentials' && (
          <form onSubmit={handleValidateCredentials} className="space-y-4">
            {/* TODO: add instructions for how to get Perusall credentials */}
            <div>
              <label htmlFor="institutionId" className="block text-sm font-medium text-gray-700">
                Institution ID
              </label>
              <input
                type="text"
                id="institutionId"
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Your Perusall Institution ID"
              />
            </div>
            <div>
              <label htmlFor="apiToken" className="block text-sm font-medium text-gray-700">
                API Token
              </label>
              <div className="relative mt-1">
                <input
                  type={showApiToken ? "text" : "password"}
                  id="apiToken"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  required
                  className="block w-full px-3 py-2 pr-10 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Your Perusall API Token"
                />
                <button
                  type="button"
                  onClick={() => setShowApiToken(!showApiToken)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                >
                  {showApiToken ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
            >
              Connect to Perusall
            </button>
          </form>
        )}

        {/* Step 2: Validating */}
        {step === 'validate-credentials' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Validating your credentials...</p>
          </div>
        )}

        {/* Step 3: Course Selection */}
        {step === 'select-courses' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Select the courses you want to import from Perusall:
            </p>

            {courses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No courses found in your Perusall account.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {courses.map((course) => {
                  const courseId = course._id || ''
                  const courseName = course.name || 'Unnamed Course'
                  const isSelected = selectedCourseIds.includes(courseId)
                  const isImported = importedCourseIds.includes(courseId)

                  return (
                  <Field
                      key={courseId}
                      className={`flex items-center p-3 gap-3 border border-gray-200 rounded-md ${
                        isImported
                          ? 'bg-gray-50 opacity-60 cursor-not-allowed'
                          : 'hover:bg-gray-50 cursor-pointer'
                      }`}
                      onClick={() => !isImported && handleCourseSelection(courseId)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => handleCourseSelection(courseId)}
                      disabled={isImported}
                      className="group shrink-0 block h-4 w-4 rounded border border-gray-300 bg-white data-[checked]:bg-blue-600 data-[checked]:border-blue-600 data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                    >
                      <svg className="stroke-white opacity-0 group-data-[checked]:opacity-100" viewBox="0 0 14 14" fill="none">
                        <path d="M3 8L6 11L11 3.5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Checkbox>
                    <Label className={`text-gray-900 ${isImported ? 'cursor-not-allowed' : 'cursor-pointer'} flex-1`}>
                      {courseName}
                    </Label>
                  </Field>
                  )
                })}
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            {(() => {
              // Calculate courses to actually import (exclude already imported)
              const newCoursesToImport = selectedCourseIds.filter(id => !importedCourseIds.includes(id))

              return (
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setStep('set-credentials')}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleImportCourses}
                    disabled={newCoursesToImport.length === 0}
                    className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Import {newCoursesToImport.length} Course(s)
                  </button>
                </div>
              )
            })()}
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 'import-courses' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">
              Importing {selectedCourseIds.filter(id => !importedCourseIds.includes(id)).length} course(s)...
            </p>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 'complete-integration' && (
          <div className="text-center py-8">
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Courses Imported Successfully!
            </h3>
            <p className="text-gray-600">
              Redirecting to your dashboard...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}