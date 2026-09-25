import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ButtonLink } from '@/ui/Button'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
      <p className="mb-6 break-words text-muted">{message}</p>
      <ButtonLink to="/">Back to home</ButtonLink>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <ButtonLink to="/" variant="secondary">
        Back to home
      </ButtonLink>
    </div>
  )
}
