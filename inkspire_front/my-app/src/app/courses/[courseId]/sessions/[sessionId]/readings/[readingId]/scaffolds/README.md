# Scaffold Page Component

## File Structure

```
scaffolds/
├── page.tsx              # Main scaffold page component (create-task structure)
├── page.module.css        # Layout and styling (copied from create-task)
├── Navigation.tsx          # Navigation component (local copy)
├── Navigation.module.css   # Navigation component styles
├── ui.module.css          # UI component styles (local copy)
├── styles.module.css      # Additional scaffold-specific styles
└── README.md              # This file
```

## Description

This is the scaffold display and management page for reading sessions. It provides a three-column layout for reviewing and managing scaffolds generated for specific readings.

## Features

- **Three-column layout**: Info panel | PDF viewer | Scaffold list
- **Scaffold operations**: Accept, Reject, Modify scaffolds
- **Multi-reading navigation**: Navigate between readings in a session
- **Real-time progress tracking**: Shows review progress
- **PDF fragment navigation**: Click scaffolds to highlight PDF sections (basic iframe implementation)
- **Responsive design**: Adapts to different screen sizes

## Dependencies

### Local Components
- `Navigation.tsx` - Top navigation bar (local copy)
- `ui.module.css` - Local UI component styles
- `styles.module.css` - Local layout and scaffold-specific styles

### External Dependencies
- Next.js hooks: `useRouter`, `useParams`, `useSearchParams`
- `@headlessui/react` - Dialog component for mobile menu
- `@heroicons/react/24/outline` - Icons (Bars3Icon, XMarkIcon)
- `@/components/ui/PdfPreview` - PDF preview component (shared)
- `rangy` - Text selection and highlighting library
- `pdfjs-dist` - PDF rendering library (via CDN)

### API Endpoints Used
- `GET /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds`
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/accept`
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/reject`
- `POST /api/courses/{course_id}/sessions/{session_id}/readings/{reading_id}/scaffolds/{scaffold_id}/modify`

## Component Architecture

### Navigation Component
- **Purpose**: Top navigation bar with mobile menu support
- **Features**: Logo, navigation links, responsive mobile menu
- **Dependencies**: Headless UI Dialog, Heroicons
- **Styling**: Dedicated Navigation.module.css

### PDF Preview Component
- **Purpose**: Advanced PDF viewer with text selection and highlighting
- **Location**: `@/components/ui/PdfPreview` (shared component)
- **Features**: 
  - Three-layer architecture (Canvas + Text Layer + Overlay Layer)
  - PDF.js rendering with high-DPI support
  - Advanced text indexing and search
  - Flexible regex pattern matching for PDF text quirks
  - Responsive scaling and viewport management
  - Scaffold fragment highlighting and navigation
  - Text selection with Rangy library
- **Dependencies**: PDF.js (via CDN), Rangy, CSS highlight classes
- **Styling**: Integrated with scaffold highlighting system
- **Performance**: Dynamic loading, cancellation handling, memory management

## State Management

Uses React local state with hooks:
- `scaffolds` - List of scaffold data
- `loading` - Loading state
- `error` - Error state
- `navigationData` - Multi-reading navigation data
- `activeFragment` - Currently highlighted PDF fragment
- `manualEditSubmittingId` - Loading state for scaffold operations

## Navigation Features

Supports multi-reading navigation when `navigation=true` query param is present:
- Previous/Next reading buttons
- Progress indicator (X of Y readings)
- SessionStorage integration for navigation state

## PDF Implementation

Now uses the complete PdfPreview component with full advanced functionality:
- **Architecture**: Three-layer system (Canvas + Text Layer + Overlay Layer)
- **Rendering**: PDF.js with high-DPI support and responsive scaling
- **Text Processing**: Advanced indexing, flexible regex matching, text quirks handling
- **Interactivity**: Click scaffolds to highlight corresponding PDF fragments
- **Search**: Automatic highlighting of scaffold fragments with intelligent matching
- **Navigation**: Smooth scrolling to highlighted fragments with viewport management
- **Performance**: Dynamic loading, cancellation handling, memory optimization
- **Dependencies**: PDF.js (via CDN), Rangy library, CSS highlight classes
- **Features**: Text selection, fragment navigation, responsive design

## Styling Architecture

The styling is organized into three modules for better organization:

1. **Navigation.module.css** - Navigation component specific styles
2. **ui.module.css** - Reusable UI component styles
3. **styles.module.css** - Layout and scaffold-specific styles

This separation allows for:
- Complete independence from global styles
- Modular component architecture
- Better maintainability and reusability
- Clear separation of concerns

## Migration Notes

This component has been migrated from global dependencies to local components:
- ✅ Navigation component copied locally
- ✅ UI styles extracted to local module
- ✅ Layout styles extracted to local module
- ✅ PdfPreview component referenced from shared location
- ✅ All dependencies properly resolved

**Component Reuse Strategy:**
- **Navigation**: Local copy (scaffold-specific styling)
- **PdfPreview**: Shared component (complex functionality, maintain single source)
- **UI Styles**: Local copy (scaffold-specific customizations)
- **Layout Styles**: Local copy (scaffold-specific layout)

## Future Enhancements

- **PDF Enhancement**: Could integrate full PdfPreview component for advanced features
- **Component Sharing**: Local components could be extracted to shared library
- **Advanced Navigation**: Enhanced PDF fragment highlighting
- **Offline Support**: Add offline PDF viewing capabilities
