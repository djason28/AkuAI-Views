# CSS Structure Documentation

## File Organization

### 1. Global Styles
**File:** `src/lib/styles/global.css`
- CSS variables (colors, spacing, typography)
- Global reset styles
- Utility classes
- Common components styles

### 2. Page-Specific Styles
**Chat Page:** `src/lib/styles/chat.css`
- Main chat interface styles
- Sidebar styles
- Message bubbles
- Input area
- Header and navigation

**Login Page:** `src/lib/styles/login.css`
- Login form styles
- Background animations
- Form inputs and buttons
- Error messages
- Navigation links

**Register Page:** `src/lib/styles/register.css`
- Registration form styles
- Password confirmation field
- Form validation messages
- Navigation links
- Consistent styling with login page

## CSS Variables

### Colors
```css
--primary-color: #4f46e5;
--primary-light: #6366f1;
--secondary-color: #1e293b;
--secondary-light: #334155;
--background-color: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
--sidebar-bg: #0f172a;
--text-color: #64748b;
--text-light: #94a3b8;
```

### Layout
```css
--sidebar-width: 280px;
--header-height: 50px;
--input-height: 70px;
--gutter: 20px;
```

### Border Radius
```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-2xl: 20px;
--radius-3xl: 24px;
```

## Import Structure

### In Svelte Files
```javascript
// Chat page
import "../lib/styles/chat.css";

// Login page  
import "../../lib/styles/login.css";
```

### In app.html
```html
<link rel="stylesheet" href="/src/lib/styles/global.css" />
```

## Benefits

1. **Separation of Concerns**: CSS is separate from component logic
2. **Maintainability**: Easy to find and modify styles
3. **Reusability**: Global variables and utilities can be reused
4. **Performance**: CSS can be cached and loaded efficiently
5. **Organization**: Clear structure for team development

## File Structure
```
src/
├── lib/
│   └── styles/
│       ├── global.css      # Global variables and utilities
│       ├── chat.css        # Chat page styles
│       └── login.css       # Login page styles
├── routes/
│   ├── +page.svelte        # Imports chat.css
│   └── login/
│       └── +page.svelte    # Imports login.css
└── app.html                # Imports global.css
```

## Customization

To modify colors or spacing:
1. Edit variables in `global.css`
2. Changes will automatically apply to all components
3. For page-specific changes, edit the respective CSS file

## Best Practices

1. Use CSS variables for consistent theming
2. Keep page-specific styles in separate files
3. Use utility classes for common patterns
4. Maintain consistent naming conventions
5. Document any custom CSS additions