import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonStyles'

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant, size, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />
}

export function ButtonLink({ variant, size, className, ...rest }: LinkProps & StyleProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />
}
