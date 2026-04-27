# Sticky TOC Implementation Demo

## Visual Concept

```
┌─────────────────────────────────────────┬──────────────────┐
│ Main Content Area                       │  Sticky TOC      │
│                                         │  ┌────────────┐  │
│ # Function Documentation                │  │ On This    │  │
│                                         │  │ Page       │  │
│ ## Hashing Functions                    │  ├────────────┤  │
│  - crypto_sha256() ...                  │  │ • Hashing  │◄─ Active
│  - crypto_sha512() ...                  │  │ • Password │  │
│                                         │  │ • Table    │  │
│ ## Password Functions                   │  │ • Aggregate│  │
│  - crypto_bcrypt() ...                  │  └────────────┘  │
│  - crypto_bcrypt_verify() ...           │                  │
│                                         │  [Scrolls with   │
│ ## Table Functions                      │   viewport]      │
│  - crypto_generate_keys() ...           │                  │
│  - crypto_audit_trail() ...             │                  │
│                                         │                  │
└─────────────────────────────────────────┴──────────────────┘
```

## Implementation Approach

### Layout Structure
```astro
<!-- Function Reference Section -->
<section class="py-16 lg:py-24 bg-white">
  <div class="section-container">
    <div class="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">

      <!-- Main Content (left) -->
      <div class="space-y-12 max-w-4xl">
        <SectionHeader ... />
        <!-- Function docs go here -->
      </div>

      <!-- Sticky TOC Sidebar (right, desktop only) -->
      <aside class="hidden lg:block">
        <nav class="sticky top-24 space-y-4">
          <h3>On This Page</h3>
          <ul>
            <li><a href="#hashing">Hashing</a></li>
            <li><a href="#password">Password</a></li>
            <li><a href="#table">Table</a></li>
            <li><a href="#aggregate">Aggregate</a></li>
          </ul>
        </nav>
      </aside>

    </div>
  </div>
</section>
```

## Key CSS Classes

```css
.sticky {
  position: sticky;
  top: 6rem; /* 24 = 96px, adjust for header height */
}
```

## Features

1. **Auto-highlighting**: Active section highlighted as you scroll
2. **Smooth scrolling**: Click TOC item to smoothly scroll to section
3. **Desktop only**: Hidden on mobile (< lg breakpoint)
4. **Collapsible groups**: Hashing → sha256, sha512, hmac_sha256
5. **Function count badges**: "Hashing (5)"

## JavaScript Enhancement (Optional)

```javascript
// Track scroll position and highlight active section
document.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('[id^="crypto_"]');
  const scrollY = window.pageYOffset;

  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.offsetHeight;
    if (scrollY >= sectionTop - 100 && scrollY < sectionTop + sectionHeight) {
      // Highlight corresponding TOC item
      document.querySelector(`a[href="#${section.id}"]`)
        .classList.add('active');
    }
  });
});
```

## Pros & Cons

### Pros
- ✅ Easy navigation through long page
- ✅ Shows user where they are
- ✅ Professional documentation look
- ✅ No layout shift (reserved space)

### Cons
- ❌ Reduces content width on desktop
- ❌ Requires JavaScript for active state (optional)
- ❌ Not visible on mobile/tablet

## Alternative: Floating Button

Instead of always-visible sidebar, could use a floating TOC button:

```
┌─────────────────────────────────────┐
│ Main Content Area                   │
│                                     │
│ Function documentation...           │
│                                     │  ┌─────────┐
│                                     │  │ [📋 TOC]│ ← Floating
│                                     │  └─────────┘   button
│                                     │
└─────────────────────────────────────┘
```

Clicking opens overlay/drawer with full TOC.

## Recommendation

For the crypto extension page with 9 functions:
- **Option 1**: Sticky sidebar (shows categories: Hashing, Password, Table, Aggregate)
- **Option 2**: Enhanced "Functions Index" section that's sticky when scrolling
- **Option 3**: Floating TOC button (cleaner, doesn't reduce content width)

Which approach would you prefer?
