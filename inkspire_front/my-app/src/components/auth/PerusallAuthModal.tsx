'use client'

import { useState } from 'react'

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
  const [step, setStep] = useState<Step>('set-credentials')
  const [institutionId, setInstitutionId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [courses, setCourses] = useState<PerusallCourse[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleValidateCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setStep('validate-credentials')
    setError(null)

    try {
      // Step 1: Validate Perusall credentials
      const authResponse = await fetch('/api/perusall/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' }
      })

      if (!coursesResponse.ok) {
        const data = await coursesResponse.json()
        throw new Error(data.detail || 'Failed to fetch Perusall courses')
      }

      const coursesData = await coursesResponse.json()
      setCourses(coursesData.courses || [])
      setStep('select-courses')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStep('set-credentials')
    }
  }

  const handleCourseSelection = (courseId: string) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  const handleImportCourses = async () => {
    if (selectedCourseIds.length === 0) {
      setError('Please select at least one course to import')
      return
    }

    setStep('import-courses')
    setError(null)

    try {
      const response = await fetch('/api/perusall/import-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_ids: selectedCourseIds })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to import courses')
      }

      setStep('complete-integration')
      // Auto-close after 2 seconds and trigger dashboard refresh
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setStep('select-courses')
    }
  }

  if (!isOpen) return null

  return (
    <div className={`fixed inset-0 ${allowClose ? 'bg-black bg-opacity-60' : 'bg-black'} flex items-center justify-center z-[9999]`}>
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
              <input
                type="password"
                id="apiToken"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                required
                className="mt-1 block w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Your Perusall API Token"
              />
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
                  return (
                  <label
                      key={courseId}
                    className="flex items-center p-3 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                        checked={selectedCourseIds.includes(courseId)}
                        onChange={() => handleCourseSelection(courseId)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                      <span className="ml-3 text-gray-900">{courseName}</span>
                  </label>
                  )
                })}
              </div>
            )}

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep('set-credentials')}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={handleImportCourses}
                disabled={selectedCourseIds.length === 0}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Import ({selectedCourseIds.length}) Course(s)
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === 'import-courses' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Importing {selectedCourseIds.length} course(s)...</p>
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