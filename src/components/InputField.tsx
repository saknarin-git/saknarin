import type { InputHTMLAttributes } from 'react';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function InputField({ label, ...props }: InputFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}