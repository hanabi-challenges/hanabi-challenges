import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../../src/App';

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders landing page copy', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /hanabi competitions/i })).toBeInTheDocument();
  });
});
