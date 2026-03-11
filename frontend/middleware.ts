import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This middleware checks for a valid JWT in cookies and redirects unauthenticated users to /login
export function middleware(request: NextRequest) {
  // Check if the current route is protected (customize as needed)
  const isPublicRoute = request.nextUrl.pathname.startsWith('/login')
  
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Retrieve the JWT from cookies
  const token = request.cookies.get('jwt')?.value

  // Redirect to /login if the user is not authenticated
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    // Optional: Pass the original URL to redirect back after login
    // loginUrl.searchParams.set('from', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// Routes Proxy should not run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)']
}
