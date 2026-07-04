import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/login"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const authObject = await auth();
    if (!authObject.userId) {
      const returnBackUrl = new URL(req.url).pathname === "/" ? new URL("/chart", req.url) : req.url;
      return authObject.redirectToSignIn({ returnBackUrl });
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
