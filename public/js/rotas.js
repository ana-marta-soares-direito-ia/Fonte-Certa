export const ligarAcordao = url => `#/acordao?u=${encodeURIComponent(url)}`;
export const ligarDiploma = (caminho, artigo = "", data = "") =>
  `#/diploma?p=${encodeURIComponent(caminho)}${artigo ? `&art=${encodeURIComponent(artigo)}` : ""}${data ? `&data=${data}` : ""}`;

export function lerRota() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [caminho, consulta = ""] = h.split("?");
  return { caminho: caminho || "/", params: new URLSearchParams(consulta) };
}
