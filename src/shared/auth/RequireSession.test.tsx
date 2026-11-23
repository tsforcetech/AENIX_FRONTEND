import { render, screen } from '@testing-library/react';
import { RequireSession } from './RequireSession';

vi.mock('./session', () => ({ useSession: () => ({ status: 'unavailable' }) }));

describe('RequireSession', () => {
  it('denies by default when no identity service is available', () => {
    render(
      <RequireSession>
        <p>secret content</p>
      </RequireSession>,
    );
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Access unavailable');
  });
});
