// The whole app is a single client-rendered page (score editor state lives in
// localStorage), so prerendering it gives adapter-static a static index.html
// to serve while all real behavior still happens in the browser after hydration.
export const prerender = true;
