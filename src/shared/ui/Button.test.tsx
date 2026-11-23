import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('blocks clicks while busy (double-submit guard)', async () => {
    const onClick = vi.fn();
    render(
      <Button busy onClick={onClick}>
        Post
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Post' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type=button so it never submits forms accidentally', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
