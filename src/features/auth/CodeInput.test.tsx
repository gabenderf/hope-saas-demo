import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeInput } from './CodeInput';

function boxes() {
  return screen.getAllByRole('textbox') as HTMLInputElement[];
}
function values() {
  return boxes().map((b) => b.value).join('|');
}

describe('CodeInput (tela de código)', () => {
  afterEach(cleanup);

  it('seis casas numéricas, a primeira com preenchimento automático do celular', () => {
    render(<CodeInput />);
    const all = boxes();
    expect(all).toHaveLength(6);
    expect(all[0]).toHaveAttribute('autocomplete', 'one-time-code');
    for (const b of all) expect(b).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('group', { name: 'Código de 6 dígitos' })).toBeInTheDocument();
  });

  it('digitar avança sozinho e completa', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<CodeInput autoFocus onComplete={onComplete} />);
    expect(boxes()[0]).toHaveFocus();
    await user.keyboard('1234');
    expect(boxes()[4]).toHaveFocus();
    await user.keyboard('56');
    expect(values()).toBe('1|2|3|4|5|6');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('colar o código inteiro preenche tudo, mesmo colando no meio', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<CodeInput onComplete={onComplete} />);
    await user.click(boxes()[3]!);
    await user.paste('987 654');
    expect(values()).toBe('9|8|7|6|5|4');
    expect(onComplete).toHaveBeenCalledWith('987654');
  });

  it('apagar limpa a casa e, vazia, volta para a anterior', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CodeInput autoFocus onChange={onChange} />);
    await user.keyboard('123');
    expect(boxes()[3]).toHaveFocus();
    await user.keyboard('{Backspace}');
    expect(values()).toBe('1|2||||');
    expect(boxes()[2]).toHaveFocus();
    await user.keyboard('{Backspace}');
    expect(values()).toBe('1|||||');
    expect(onChange).toHaveBeenLastCalledWith('1');
  });

  it('letra é ignorada', async () => {
    const user = userEvent.setup();
    render(<CodeInput autoFocus />);
    await user.keyboard('a1');
    expect(values()).toBe('1|||||');
  });
});
