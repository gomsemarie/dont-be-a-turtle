import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  label?: string;
  unit?: string;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, min = 0, max = 100, step = 1, onChange, label, unit = "", ...props }, ref) => {
    const percent = ((value - min) / (max - min)) * 100;

    return (
      <div className={cn("space-y-2", className)}>
        {label && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm text-muted-foreground font-mono">
              {Number.isInteger(step) ? value : parseFloat(value.toFixed(1))}{unit}
            </span>
          </div>
        )}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const raw = Number(e.target.value);
            onChange?.(Number.isInteger(step) ? raw : parseFloat(raw.toFixed(2)));
          }}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-secondary accent-primary"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) ${percent}%, hsl(var(--secondary)) ${percent}%)`,
          }}
          {...props}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
