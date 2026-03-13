import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-fallback-secret-at-least-32-chars-long'
)

// This middleware checks for a valid JWT in cookies and redirects unauthenticated users to /login
export async function middleware(request: NextRequest) {
  // Check if the current route is protected
  const isPublicRoute = request.nextUrl.pathname.startsWith('/login')
  
  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Retrieve the JWT from cookies
  const token = request.cookies.get('jwt')?.value

  // Redirect to /login if the user is not authenticated
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  try {
    // Verify the JWT
    await jwtVerify(token, JWT_SECRET)
    return NextResponse.next()
  } catch (error) {
    console.error('JWT verification failed:', error)
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }
}

// Routes Middleware should run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)']
}
