import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { SpinningLogo } from './SpinningLogo';

describe('SpinningLogo', () => {
  it('is decorative: empty alt on the record, hidden tonearm, no axe violations', async () => {
    const { container } = render(
      <a href="#home" aria-label="EarthChestra home">
        <SpinningLogo src="/logo-96" size={40} imgClassName="logo-icon" />
      </a>,
    );
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('src', '/logo-96.png');
    expect(img).toHaveClass('spinning-logo__disc', 'logo-icon');
    expect(container.querySelector('source')).toHaveAttribute('srcset', '/logo-96.webp');

    const arm = container.querySelector('svg.spinning-logo__arm')!;
    expect(arm).toHaveAttribute('aria-hidden', 'true');
    expect(arm).toHaveAttribute('focusable', 'false');
    expect(await axe(container)).toHaveNoViolations();
  });
});
