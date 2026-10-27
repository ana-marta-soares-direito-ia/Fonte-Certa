// O endereço antigo reencaminha para o endereço com o nome da autora.
const ANTIGO = "fonte-certa.pages.dev";
const NOVO = "fonte-certa-ana-marta-soares.pages.dev";

export async function onRequest({ request, next }) {
  const u = new URL(request.url);
  if (u.hostname === ANTIGO) {
    u.hostname = NOVO;
    return Response.redirect(u.toString(), 301);
  }
  return next();
}
