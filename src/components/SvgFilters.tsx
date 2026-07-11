import React from 'react';

interface SvgFiltersProps {
  inkDarkness: number; // 0 to 100
}

export const SvgFilters: React.FC<SvgFiltersProps> = ({ inkDarkness }) => {
  // Map inkDarkness (0 - 100) to slope and intercept
  // 0: slope=1, intercept=0
  // 100: slope=2.2, intercept=-0.6
  const slope = 1 + (inkDarkness / 100) * 1.2;
  const intercept = -(inkDarkness / 100) * 0.6;

  return (
    <svg
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        pointerEvents: 'none',
        userSelect: 'none'
      }}
      aria-hidden="true"
    >
      <defs>
        <filter id="scoretone-ink-darkness" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="linear" slope={slope} intercept={intercept} />
            <feFuncG type="linear" slope={slope} intercept={intercept} />
            <feFuncB type="linear" slope={slope} intercept={intercept} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
};
export default SvgFilters;
