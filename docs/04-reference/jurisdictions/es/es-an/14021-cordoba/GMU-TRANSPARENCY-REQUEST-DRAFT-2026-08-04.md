# Solicitud de acceso a información pública — Gerencia Municipal de Urbanismo de Córdoba

> **Status:** DRAFT — not yet submitted. Ready to paste into the Ayuntamiento de Córdoba's
> Sede Electrónica "Solicitud Genérica" form (or REC), addressed to the Gerencia Municipal de
> Urbanismo (GMU). Requires the requester's own Cl@ve/Certificado Digital to submit.
>
> **Legal basis:** Ley 19/2013, de 9 de diciembre, de transparencia, acceso a la información
> pública y buen gobierno — Título I (derecho de acceso a la información pública). A public body
> has **one month** (extendable by one further month for high-volume/complex requests, Art. 20.1)
> to respond.
>
> **Why these three items and no others:** every ask below is tied to a specific, measured gap
> already documented in this jurisdiction's own findings — not a generic "please give us your
> GIS data" request. A vague request is easy for an administration to deprioritise; an itemized
> one naming the exact missing file is not.
>
> Sources for each item: `findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` §6,
> `CLOSURE-REGISTER.md` blocker 22, `findings/CALIFICACION-ENDPOINT-PROBE.md`.

---

## Texto de la solicitud (para copiar y pegar)

**Asunto:** Solicitud de acceso a información pública — cartografía de calificación urbanística
del PGOU-2001 (Ley 19/2013)

Al amparo de lo dispuesto en la Ley 19/2013, de 9 de diciembre, de transparencia, acceso a la
información pública y buen gobierno, solicito a la Gerencia Municipal de Urbanismo de Córdoba el
acceso y la puesta a disposición, en formato digital reutilizable, de la siguiente información
sobre la cartografía de calificación urbanística del PGOU-2001 vigente:

**1. Hojas del plano de calificación (serie CUS) actualmente no accesibles.**
De las 49 hojas urbanas de la serie CUS (CUS01W a CUS49W) publicadas en el visor municipal, 41
devuelven actualmente una página de "servidor en construcción" en lugar del archivo de imagen
correspondiente (hojas CUS01–17W, CUS20–24W, CUS27–33W, CUS35–40W, CUS42–44W, CUS47–49W;
verificado el 2 de agosto de 2026). Solicito copia digital de estas 41 hojas, o la restauración de
su acceso público en el visor, en el mismo formato en que se publican las 8 hojas actualmente
accesibles (CUS18W, CUS19W, CUS25W, CUS26W, CUS34W, CUS41W, CUS45W, CUS46W).

**2. Ficheros de georreferenciación (world files) de las hojas CUS.**
Ninguna de las 8 hojas actualmente accesibles va acompañada de un fichero de
georreferenciación (`.jgw`, `.wld`, `.jpw`) ni de un fichero de proyección (`.prj` o `.aux.xml`),
por lo que las imágenes, aun siendo públicas, no pueden posicionarse correctamente sobre una base
cartográfica sin ellos. Solicito el fichero de georreferenciación correspondiente a cada una de
las 8 hojas mencionadas, y, si existen, de las 41 hojas del punto 1.

**3. Definición del campo `et` en el conjunto de datos `coaco:ordenanzas`.**
El servicio WFS del Colegio Oficial de Arquitectos de Córdoba (COACo), que entiendo se nutre de
información facilitada o validada por esa Gerencia, publica la capa `coaco:ordenanzas` con un
atributo denominado `et` cuyo significado no figura documentado en el propio servicio ni en su
metadato. Solicito la definición de dicho campo, o la documentación técnica/esquema de datos que
la contenga.

**4. (Opcional, de mayor alcance) Disponibilidad de la cartografía de calificación en formato
vectorial.**
Si la Gerencia dispone internamente de la cartografía de calificación urbanística del PGOU-2001
en formato vectorial (shapefile, geodatabase, DWG/DXF georreferenciado o servicio WFS/WMS) para
la totalidad o parte del término municipal más allá del ámbito ya publicado por COACo (distritos
Sur y Noroeste), solicito su puesta a disposición en dicho formato, al amparo de la Ley 19/2013 y,
en su caso, de la normativa de reutilización de información del sector público.

Quedo a la espera de respuesta en el plazo legalmente establecido. Agradezco de antemano la
atención prestada.

---

## Notes for whoever submits this

- Items 1–3 are small, specific, and hard to refuse on scope grounds — that's deliberate. Item 4
  is the actual prize (real vector data for the whole municipality) but is phrased as optional/
  broader so a "no" to item 4 doesn't block a "yes" to 1–3.
- Even a "no" or partial answer is useful: it converts an *engineering* "we searched and found
  nothing" into a *legal* record of the administration's own position, which matters if this is
  ever escalated (Consejo de Transparencia y Buen Gobierno accepts appeals against silence or
  refusal under Ley 19/2013 Art. 24).
- If GMU responds with real vector data for item 4, that changes Córdoba's coverage math directly
  — route it back into this jurisdiction's findings docs before any engineering work starts on it,
  the same "verify before acting" discipline every other source in this dossier went through.
