// Browser-only. Signs in by submitting a real (top-level) form POST to
// /api/auth/login, which answers with the session cookie on a 303 redirect to
// the right dashboard. Used after signup/join so a brand-new account lands
// signed in on iPhones too — see the note in app/api/auth/login/route.ts on
// why a cookie from a fetch() response isn't enough there.
export function signInWithForm(email: string, password: string) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = "/api/auth/login";
  form.style.display = "none";
  for (const [name, value] of Object.entries({ email, password })) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
