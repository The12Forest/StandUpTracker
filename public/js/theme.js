// Theme Engine — persistent across pages
(function () {
  function getStoredTheme() {
    try {
      const user = JSON.parse(localStorage.getItem('sut_user') || '{}');
      return user.theme || localStorage.getItem('sut_theme') || 'dark';
    } catch { return 'dark'; }
  }

  function applyTheme(theme) {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  // Apply immediately on load
  applyTheme(getStoredTheme());

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  });

  // Global function for theme changes
  window.changeTheme = async function (theme) {
    localStorage.setItem('sut_theme', theme);
    applyTheme(theme);

    // Update user on server
    const token = localStorage.getItem('sut_token');
    if (token) {
      try {
        const user = JSON.parse(localStorage.getItem('sut_user') || '{}');
        user.theme = theme;
        localStorage.setItem('sut_user', JSON.stringify(user));

        await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme }),
        });
      } catch { /* silent */ }
    }
  };
})();
