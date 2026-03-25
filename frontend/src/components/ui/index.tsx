import React from 'react';
import { cn } from '../../lib/utils';
import { Icons } from '../Icons';

export const Button = ({
  children,
  className,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/10',
    secondary: 'bg-white dark:bg-slate-800 text-blue-900 dark:text-slate-100 border border-blue-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-700 shadow-sm',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
    ghost: 'bg-transparent text-blue-600 dark:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-slate-800',
  };

  return (
    <button
      className={cn(
        'px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const Card = ({ children, className, title, subtitle, action }: { children: React.ReactNode; className?: string; title?: string; subtitle?: string; action?: React.ReactNode; key?: string }) => (
  <div className={cn('bg-white dark:bg-slate-900 rounded-2xl border border-blue-100/50 dark:border-slate-700/50 shadow-sm', className)}>
    {(title || subtitle || action) && (
      <div className="px-6 py-5 flex items-center justify-between border-b border-blue-50 dark:border-slate-700/50">
        <div>
          {title && <h3 className="text-base font-semibold text-blue-900 dark:text-slate-100">{title}</h3>}
          {subtitle && <p className="text-sm text-blue-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

export const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-medium text-blue-900/70 dark:text-slate-400">{label}</label>}
    <input
      className={cn(
        'w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none transition-all duration-200 text-sm text-blue-900 dark:text-slate-100 placeholder:text-blue-300 dark:placeholder:text-slate-500',
        error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500',
        props.className
      )}
      {...props}
    />
    {error && <p className="text-xs font-medium text-red-500">{error}</p>}
  </div>
);

export const TextArea = ({ label, error, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-medium text-blue-900/70 dark:text-slate-400">{label}</label>}
    <textarea
      className={cn(
        'w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none transition-all duration-200 text-sm text-blue-900 dark:text-slate-100 placeholder:text-blue-300 dark:placeholder:text-slate-500 resize-none min-h-[100px]',
        error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500',
        props.className
      )}
      {...props}
    />
    {error && <p className="text-xs font-medium text-red-500">{error}</p>}
  </div>
);

export const Checkbox = ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="flex items-center gap-3 cursor-pointer group">
    <div className="relative flex items-center justify-center">
      <input
        type="checkbox"
        className="peer sr-only"
        {...props}
      />
      <div className="w-5 h-5 border-2 border-blue-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all duration-200 group-hover:border-blue-400" />
      <Icons.Check className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 pointer-events-none" />
    </div>
    <span className="text-sm font-medium text-blue-900/70 dark:text-slate-400 group-hover:text-blue-900 dark:group-hover:text-slate-100 transition-colors">{label}</span>
  </label>
);

export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label?: string }) => (
  <label className="flex items-center gap-3 cursor-pointer group">
    <div
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-10 h-5 rounded-full transition-all duration-300',
        checked ? 'bg-blue-600' : 'bg-blue-100 dark:bg-slate-700'
      )}
    >
      <div
        className={cn(
          'absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </div>
    {label && <span className="text-sm font-medium text-blue-900/70 dark:text-slate-400 group-hover:text-blue-900 dark:group-hover:text-slate-100 transition-colors">{label}</span>}
  </label>
);

export const RadioGroup = ({ label, options, value, onChange }: { label?: string; options: { value: string; label: string }[]; value: string; onChange: (val: string) => void }) => (
  <div className="space-y-2 w-full">
    {label && <label className="text-sm font-medium text-blue-900/70 dark:text-slate-400">{label}</label>}
    <div className="flex flex-wrap gap-3">
      {options.map(opt => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer group">
          <div className="relative flex items-center justify-center">
            <input
              type="radio"
              name={label}
              className="peer sr-only"
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
            />
            <div className="w-5 h-5 border-2 border-blue-200 dark:border-slate-600 rounded-full bg-white dark:bg-slate-800 peer-checked:border-blue-600 transition-all duration-200 group-hover:border-blue-400" />
            <div className="absolute w-2.5 h-2.5 bg-blue-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity duration-200 pointer-events-none" />
          </div>
          <span className="text-sm font-medium text-blue-900/70 dark:text-slate-400 group-hover:text-blue-900 dark:group-hover:text-slate-100 transition-colors">{opt.label}</span>
        </label>
      ))}
    </div>
  </div>
);

export const Select = ({ label, options, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[]; error?: string }) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="text-sm font-medium text-blue-900/70 dark:text-slate-400">{label}</label>}
    <div className="relative">
      <select
        className={cn(
          'w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-blue-100 dark:border-slate-700 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none transition-all duration-200 text-sm text-blue-900 dark:text-slate-100 appearance-none',
          error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500',
          props.className
        )}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <Icons.ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" />
    </div>
    {error && <p className="text-xs font-medium text-red-500">{error}</p>}
  </div>
);
