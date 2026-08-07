/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' so the light/dark toggle on the Menu page can flip a single
  // class on <html> — doesn't affect any other page, since nothing else
  // in the app uses dark: prefixed utilities.
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1A1423',      // background — darkroom/ink base, not pure black
        ink2: '#241B32',     // elevated surface
        reel: '#E8A33D',     // signature accent — film-leader amber
        reel2: '#C97B2E',    // deeper amber for hover/pressed states
        bone: '#F2EBE2',     // primary text — warm off-white, not stark white
        smoke: '#9A8FA8',    // secondary text — muted lavender-grey
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body: ['"Work Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        sprocket: '2px',
      },
    },
  },
  plugins: [],
};
