// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { O2DSelectField } from './O2DSelectField';
afterEach(cleanup);
describe('O2DSelectField', () => {
  it('searches without dirtying, supports keyboard selection, and keeps Escape within the dropdown', () => {
    const change = vi.fn(),
      parentKey = vi.fn();
    render(
      <div onKeyDown={parentKey}>
        <O2DSelectField
          id="terms"
          label="Payment Terms"
          value="Old existing term"
          options={['60 DAYS', '90 DAYS PCD CHEQUE', 'CASH']}
          searchable
          onChange={change}
        />
      </div>,
    );
    const input = screen.getByRole('combobox', { name: 'Payment Terms' });
    fireEvent.focus(input);
    expect(
      screen
        .getByRole('option', { name: 'Old existing term (current value)' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    fireEvent.change(input, { target: { value: 'PCD' } });
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByRole('option', { name: 'CASH' })).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenCalledWith('90 DAYS PCD CHEQUE');
    fireEvent.click(input);
    parentKey.mockClear();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(parentKey).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('Old existing term');
  });
  it('selects exact strings by mouse and permits blank without allowing arbitrary text', () => {
    const change = vi.fn();
    render(
      <O2DSelectField
        id="remarks"
        label="Remarks"
        value="Hold"
        options={['Awaiting for Payment', 'No Issues ? Proceed']}
        searchable
        onChange={change}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.click(
      screen.getByRole('option', { name: 'No Issues ? Proceed' }),
    );
    expect(change).toHaveBeenLastCalledWith('No Issues ? Proceed');
    fireEvent.click(input);
    fireEvent.click(screen.getByRole('option', { name: 'Select...' }));
    expect(change).toHaveBeenLastCalledWith('');
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'invented value' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(change).toHaveBeenCalledTimes(2);
  });
  it('handles loading, read-only and validation error states', () => {
    const change = vi.fn();
    const view = render(
      <O2DSelectField
        id="status"
        label="Status"
        value=""
        options={[]}
        loading
        searchable
        onChange={change}
      />,
    );
    expect((screen.getByRole('combobox') as HTMLInputElement).disabled).toBe(
      true,
    );
    view.rerender(
      <O2DSelectField
        id="status"
        label="Status"
        value="Approved"
        options={['Approved']}
        readOnly
        searchable
        onChange={change}
      />,
    );
    expect((screen.getByLabelText('Status') as HTMLInputElement).readOnly).toBe(
      true,
    );
    fireEvent.focus(screen.getByLabelText('Status'));
    expect(screen.queryByRole('listbox')).toBeNull();
    view.rerender(
      <O2DSelectField
        id="status"
        label="Status"
        value=""
        options={['Approved']}
        error="Choose a status"
        onChange={change}
      />,
    );
    expect(screen.getByRole('combobox').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(screen.getByRole('alert').textContent).toBe('Choose a status');
  });
});
