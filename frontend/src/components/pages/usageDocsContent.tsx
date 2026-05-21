import type { ReactNode } from 'react';
import { USAGE_DOCS_PAGES as SHARED_USAGE_DOCS_PAGES } from '../../config/publicRouteSeoData.mjs';
import type { IntentPageKey } from '../../config/intentPages';
import {
  FREE_PLAN_CREDITS,
  FREE_PLAN_LIMITS,
  PREMIUM_PLAN_CREDITS,
  PREMIUM_PLAN_LIMITS,
  formatPlanLimitCount,
} from '../../config/planLimits.mjs';

export type UsageDocsPageKey =
  | 'index'
  | 'getting-started'
  | 'detection'
  | 'rename-mapping'
  | 'editor-workflow'
  | 'search-fill'
  | 'fill-from-images'
  | 'fill-by-link'
  | 'signature-workflow'
  | 'api-fill'
  | 'create-group'
  | 'save-download-profile'
  | 'troubleshooting';

export type UsageDocsSection = {
  id: string;
  title: string;
  body: ReactNode;
};

export type UsageDocsPage = {
  key: UsageDocsPageKey;
  slug: string;
  navLabel: string;
  title: string;
  summary: string;
  relatedWorkflowKeys?: IntentPageKey[];
  sections: UsageDocsSection[];
};

export type ResolvedUsageDocsPath =
  | { kind: 'canonical'; pageKey: UsageDocsPageKey }
  | { kind: 'redirect'; targetPath: string }
  | { kind: 'not-found'; requestedPath: string };

type SharedUsageDocsPage = {
  key: UsageDocsPageKey;
  slug: string;
  path: string;
  navLabel: string;
  title: string;
  summary: string;
  relatedWorkflowKeys?: IntentPageKey[];
  sectionTitles: string[];
};

const USAGE_DOCS_BASE_PATH = '/es/usage-docs';

const buildUsageDocsHref = (pageKey: UsageDocsPageKey): string => {
  const page = USAGE_DOCS_PAGE_METADATA_BY_KEY.get(pageKey);
  if (!page || !page.slug) return USAGE_DOCS_BASE_PATH;
  return `${USAGE_DOCS_BASE_PATH}/${page.slug}`;
};

const USAGE_DOCS_PAGE_METADATA = SHARED_USAGE_DOCS_PAGES as SharedUsageDocsPage[];
const USAGE_DOCS_PAGE_METADATA_BY_KEY = new Map<UsageDocsPageKey, SharedUsageDocsPage>(
  USAGE_DOCS_PAGE_METADATA.map((page) => [page.key, page]),
);

const getUsageDocsPageMetadata = (
  pageKey: UsageDocsPageKey,
): Pick<UsageDocsPage, 'key' | 'slug' | 'navLabel' | 'title' | 'summary' | 'relatedWorkflowKeys'> => {
  const page = USAGE_DOCS_PAGE_METADATA_BY_KEY.get(pageKey);
  if (!page) {
    throw new Error(`Unknown usage docs page key: ${pageKey}`);
  }

  return {
    key: page.key,
    slug: page.slug,
    navLabel: page.navLabel,
    title: page.title,
    summary: page.summary,
    relatedWorkflowKeys: page.relatedWorkflowKeys,
  };
};

const USAGE_DOCS_PAGES: UsageDocsPage[] = [
  {
    ...getUsageDocsPageMetadata('index'),
    sections: [
      {
        id: 'resumen-del-flujo',
        title: 'Resumen del flujo',
        body: (
          <>
            <p>
              DullyPDF sigue una secuencia estable: subir PDF, detectar campos con CommonForms, revisar nombres y
              tipos, limpiar la plantilla, guardar, y después rellenar con Search &amp; Fill, Fill By Link o API Fill.
            </p>
            <p>
              La prioridad es mantener el PDF aprobado como documento base. DullyPDF no rediseña el formulario:
              coloca campos revisables encima del archivo, guarda la estructura y genera salidas rellenadas cuando ya
              confías en la plantilla.
            </p>
          </>
        ),
      },
      {
        id: 'antes-de-empezar',
        title: 'Antes de empezar',
        body: (
          <ul>
            <li>El límite de subida del PDF es 50MB.</li>
            <li>El editor completo está pensado para escritorio; móvil es una experiencia de explicación y entrada.</li>
            <li>Search &amp; Fill puede usar CSV, XLSX, JSON o respuestas guardadas de Fill By Link. SQL y TXT sirven solo para esquema.</li>
            <li>Las acciones con OpenAI requieren sesión iniciada y créditos disponibles.</li>
            <li>Las cuentas gratis incluyen {formatPlanLimitCount(FREE_PLAN_LIMITS.pdfDownloadsMonthlyMax)} descargas generadas por mes.</li>
            <li>Premium incluye descargas generadas ilimitadas y {formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)} créditos OpenAI mensuales.</li>
          </ul>
        ),
      },
      {
        id: 'elegir-la-pagina-correcta',
        title: 'Elegir la página correcta',
        body: (
          <ul>
            <li><a href={buildUsageDocsHref('detection')}>Detección</a>: confianza, geometría y revisión inicial.</li>
            <li><a href={buildUsageDocsHref('rename-mapping')}>Renombrar y mapear</a>: nombres de campos, columnas y reglas.</li>
            <li><a href={buildUsageDocsHref('editor-workflow')}>Editor</a>: mover, redimensionar, cambiar tipos y guardar.</li>
            <li><a href={buildUsageDocsHref('search-fill')}>Search &amp; Fill</a>: rellenar desde filas revisadas.</li>
            <li><a href={buildUsageDocsHref('fill-by-link')}>Fill By Link</a>: recopilar respuestas con un formulario web.</li>
            <li><a href={buildUsageDocsHref('api-fill')}>API Fill</a>: rellenar PDFs desde JSON en sistemas internos.</li>
            <li><a href={buildUsageDocsHref('create-group')}>Grupos</a>: paquetes de varios PDFs con una sola fuente de datos.</li>
            <li><a href={buildUsageDocsHref('troubleshooting')}>Solución de problemas</a>: diagnóstico por etapa.</li>
          </ul>
        ),
      },
      {
        id: 'rutas-publicas-y-documentacion',
        title: 'Rutas públicas y documentación',
        body: (
          <>
            <p>
              Las páginas de flujos e industrias explican para qué sirve una solución. Esta documentación explica cómo
              operarla: límites, orden de revisión, validaciones y cuándo guardar o publicar.
            </p>
            <p>
              Para un primer despliegue, elige una ruta de flujo, prepara una sola plantilla representativa y vuelve a
              estas guías para completar una prueba controlada antes de escalar.
            </p>
          </>
        ),
      },
      {
        id: 'tres-rutas-rapidas',
        title: 'Tres rutas rápidas',
        body: (
          <ul>
            <li>Plantilla nueva: empieza en <a href={buildUsageDocsHref('getting-started')}>Primeros pasos</a>.</li>
            <li>Datos ya existentes: usa <a href={buildUsageDocsHref('search-fill')}>Search &amp; Fill</a>.</li>
            <li>Datos que debe enviar otra persona: usa <a href={buildUsageDocsHref('fill-by-link')}>Fill By Link</a>.</li>
          </ul>
        ),
      },
      {
        id: 'primer-ciclo-de-validacion',
        title: 'Primer ciclo de validación',
        body: (
          <ol>
            <li>Elige un documento recurrente, no todo el paquete.</li>
            <li>Ejecuta detección y revisa primero los campos de baja confianza.</li>
            <li>Normaliza nombres y mapeos antes de probar volumen.</li>
            <li>Rellena un registro representativo y revisa el PDF final.</li>
            <li>Solo después publica un link, crea un grupo o expone un endpoint API.</li>
          </ol>
        ),
      },
      {
        id: 'numeros-clave',
        title: 'Números clave de la app',
        body: (
          <ul>
            <li>Confianza alta: &gt;= 0.60; media: &gt;= 0.30; baja: &lt; 0.30.</li>
            <li>Los resultados de búsqueda se limitan a 25 filas por consulta.</li>
            <li>CSV, XLSX y JSON cargan hasta 5000 registros por importación.</li>
            <li>La inferencia de esquema toma hasta 200 filas de muestra.</li>
            <li>El historial de edición conserva 10 estados para deshacer y rehacer.</li>
            <li>La geometría mínima es 12 puntos para texto/casillas y 16 puntos para firma.</li>
          </ul>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('getting-started'),
    sections: [
      {
        id: 'ruta-rapida',
        title: 'Ruta rápida',
        body: (
          <ol>
            <li>Sube un PDF de hasta 50MB.</li>
            <li>Espera la detección y revisa los campos de baja confianza.</li>
            <li>Si los nombres son inconsistentes, ejecuta Rename o Rename + Map.</li>
            <li>Ajusta geometría y tipos en el editor.</li>
            <li>Guarda la plantilla.</li>
            <li>Prueba una fila con Search &amp; Fill o publica un Fill By Link controlado.</li>
          </ol>
        ),
      },
      {
        id: 'orden-recomendado',
        title: 'Orden recomendado',
        body: (
          <ul>
            <li>Detecta antes de renombrar.</li>
            <li>Renombra antes de mapear cuando las etiquetas del PDF son débiles.</li>
            <li>Mapea antes de cargar muchas filas.</li>
            <li>Valida una salida antes de publicar.</li>
            <li>Guarda la versión estable antes de crear links, grupos o endpoints.</li>
          </ul>
        ),
      },
      {
        id: 'lista-de-control',
        title: 'Lista de control inicial',
        body: (
          <ul>
            <li>El PDF base es el documento correcto y aprobado.</li>
            <li>Los campos detectados no se solapan ni quedan fuera de la página.</li>
            <li>Los nombres de campos se entienden fuera del contexto visual.</li>
            <li>Casillas y radios tienen opciones claras.</li>
            <li>La descarga plana se ve correcta en un visor común.</li>
          </ul>
        ),
      },
      {
        id: 'primeros-30-minutos',
        title: 'Primeros 30 minutos',
        body: (
          <p>
            Dedica los primeros minutos a una sola plantilla. Si intentas resolver cada variante desde el inicio,
            mezclarás problemas de detección, nombres, datos y salida. Una plantilla bien validada es mejor que cinco
            plantillas medio revisadas.
          </p>
        ),
      },
      {
        id: 'errores-comunes',
        title: 'Errores comunes al empezar',
        body: (
          <ul>
            <li>Publicar un link antes de revisar el PDF generado.</li>
            <li>Usar columnas de Excel ambiguas como origen de datos.</li>
            <li>Dejar nombres duplicados en campos copiados.</li>
            <li>Confiar en detecciones de baja confianza sin redibujar.</li>
            <li>Guardar una plantilla antes de verificar casillas y radios.</li>
          </ul>
        ),
      },
      {
        id: 'salida-correcta',
        title: 'Cómo se ve una buena salida',
        body: (
          <p>
            Una salida correcta mantiene el diseño original, coloca valores en los campos esperados, no deja texto
            cortado, respeta casillas y opciones, y puede compartirse como PDF plano cuando el destinatario no necesita
            editar campos.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('detection'),
    sections: [
      {
        id: 'que-devuelve-deteccion',
        title: 'Qué devuelve la detección',
        body: (
          <p>
            La detección propone campos con tipo, página, coordenadas y confianza. Es un punto de partida, no una
            aprobación automática. El operador debe revisar si el campo corresponde al espacio real del PDF.
          </p>
        ),
      },
      {
        id: 'revisar-confianza',
        title: 'Revisar confianza',
        body: (
          <ul>
            <li>Alta: normalmente revisar tamaño y nombre.</li>
            <li>Media: confirmar tipo, borde y etiqueta cercana.</li>
            <li>Baja: revisar manualmente; a menudo conviene redibujar.</li>
          </ul>
        ),
      },
      {
        id: 'limitaciones-y-arreglos',
        title: 'Limitaciones y arreglos comunes',
        body: (
          <ul>
            <li>Escaneos borrosos generan más falsos positivos.</li>
            <li>Tablas densas pueden producir campos demasiado estrechos.</li>
            <li>Casillas visualmente pequeñas pueden confundirse con marcas o bordes.</li>
            <li>Campos de firma suelen necesitar ajuste manual de tamaño.</li>
          </ul>
        ),
      },
      {
        id: 'calidad-del-pdf',
        title: 'Rubrica de calidad del PDF',
        body: (
          <p>
            Un buen PDF base tiene texto legible, márgenes estables, áreas de respuesta claras y pocas marcas
            decorativas cerca de los campos. Si el archivo cambia cada semana, valida la versión antes de guardar una
            plantilla reutilizable.
          </p>
        ),
      },
      {
        id: 'redibujar-vs-redimensionar',
        title: 'Cuándo redibujar en vez de redimensionar',
        body: (
          <p>
            Redimensiona cuando el campo está bien ubicado pero necesita precisión. Redibuja cuando el tipo es
            incorrecto, el campo cae sobre otra zona, o el detector interpretó una línea decorativa como área de
            respuesta.
          </p>
        ),
      },
      {
        id: 'geometria',
        title: 'Geometría y restricciones del editor',
        body: (
          <p>
            Las coordenadas se guardan por página. Al mover, redimensionar o cambiar tipo, revisa que el campo siga
            dentro de su página y que el tamaño mínimo no impida escribir el valor esperado.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('rename-mapping'),
    sections: [
      {
        id: 'cuando-usar-cada-accion',
        title: 'Cuándo usar cada acción',
        body: (
          <ul>
            <li>Rename limpia nombres de campos dentro de la plantilla.</li>
            <li>Map alinea campos existentes con columnas o claves de datos.</li>
            <li>Rename + Map hace ambas cosas cuando el PDF y el esquema necesitan revisión.</li>
          </ul>
        ),
      },
      {
        id: 'limites-de-datos-openai',
        title: 'Límites de datos enviados a OpenAI',
        body: (
          <p>
            DullyPDF usa OpenAI para proponer nombres, mapeos y extracciones cuando eliges esas acciones. Revisa cada
            resultado antes de guardar, especialmente en documentos sensibles o campos con significado operativo.
          </p>
        ),
      },
      {
        id: 'interpretar-resultados',
        title: 'Interpretar resultados',
        body: (
          <p>
            Un buen resultado produce nombres estables, legibles y cercanos al esquema de datos. Si varias columnas
            parecen encajar con un campo, decide manualmente antes de rellenar.
          </p>
        ),
      },
      {
        id: 'ejemplos-de-mapeo',
        title: 'Ejemplos concretos de mapeo',
        body: (
          <ul>
            <li><code>nombre_cliente</code> puede mapear a "Nombre completo".</li>
            <li><code>fecha_ingreso</code> puede mapear a una fecha del formulario.</li>
            <li><code>aprobado</code> puede controlar una casilla si los valores booleanos son claros.</li>
          </ul>
        ),
      },
      {
        id: 'casillas-y-prioridad',
        title: 'Casillas, radios y prioridad',
        body: (
          <p>
            Las casillas y radios necesitan reglas explícitas. Revisa alias, valores verdaderos/falsos y grupos antes
            de confiar en un relleno masivo.
          </p>
        ),
      },
      {
        id: 'valores-booleanos',
        title: 'Valores booleanos comunes',
        body: (
          <p>
            Usa valores consistentes como true/false, yes/no, si/no, 1/0 o etiquetas exactas de opción. Evita columnas
            con texto libre cuando controlan casillas.
          </p>
        ),
      },
      {
        id: 'higiene-del-esquema',
        title: 'Higiene del esquema',
        body: (
          <ul>
            <li>Evita columnas duplicadas.</li>
            <li>Prefiere nombres cortos y descriptivos.</li>
            <li>No mezcles varias respuestas en una sola columna si deben ir a campos separados.</li>
            <li>Usa formatos de fecha consistentes.</li>
          </ul>
        ),
      },
      {
        id: 'advertencia-rename',
        title: 'Advertencia sobre Rename',
        body: (
          <p>
            Cambiar nombres puede invalidar valores ya rellenados. Si renombraste o remapeaste, ejecuta una prueba de
            Search &amp; Fill otra vez antes de descargar o publicar.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('editor-workflow'),
    sections: [
      {
        id: 'modelo-de-tres-paneles',
        title: 'Modelo de tres paneles',
        body: (
          <p>
            Usa el visor para revisar posición, la lista para encontrar campos por nombre y el inspector para editar
            tipo, tamaño, reglas y metadatos. Cambiar de panel sin orden suele ocultar errores simples.
          </p>
        ),
      },
      {
        id: 'modos-de-trabajo',
        title: 'Modos de revisión, edición y relleno',
        body: (
          <p>
            Revisión es para inspeccionar, edición es para corregir campos, y relleno es para validar datos. Mantén esas
            etapas separadas cuando prepares una plantilla nueva.
          </p>
        ),
      },
      {
        id: 'acciones-de-edicion',
        title: 'Acciones de edición',
        body: (
          <ul>
            <li>Mover y redimensionar campos.</li>
            <li>Cambiar tipo de campo.</li>
            <li>Crear o eliminar campos manuales.</li>
            <li>Ajustar nombre, fuente, color y tamaño de texto.</li>
            <li>Configurar reglas de casilla, radio o cálculo.</li>
          </ul>
        ),
      },
      {
        id: 'herramientas-pdf',
        title: 'PDF Tools',
        body: (
          <p>
            PDF Tools permite revisar páginas antes de guardar: borrar, reordenar, rotar, insertar páginas y optimizar
            el archivo. Después de cambiar páginas, valida que los campos sigan en el lugar correcto.
          </p>
        ),
      },
      {
        id: 'campos-de-calculo',
        title: 'Campos de cálculo',
        body: (
          <p>
            Los cálculos de DullyPDF usan entradas numéricas y salidas calculadas revisables. Mantén las fórmulas
            simples, evita dependencias circulares y valida con una fila conocida.
          </p>
        ),
      },
      {
        id: 'limpieza-en-diez-minutos',
        title: 'Orden de limpieza en diez minutos',
        body: (
          <ol>
            <li>Revisa detecciones de baja confianza.</li>
            <li>Elimina falsos positivos.</li>
            <li>Ajusta geometría.</li>
            <li>Corrige tipos.</li>
            <li>Normaliza nombres.</li>
            <li>Prueba una fila.</li>
          </ol>
        ),
      },
      {
        id: 'ciclo-de-calidad',
        title: 'Ciclo de calidad recomendado',
        body: (
          <p>
            Guarda solo cuando una salida representativa se vea correcta. Si cambias campos después, vuelve a probar el
            mismo registro para comparar antes y después.
          </p>
        ),
      },
      {
        id: 'historial-y-limpieza',
        title: 'Historial y limpieza',
        body: (
          <p>
            El editor conserva un historial corto para deshacer. Los valores actuales pueden limpiarse cuando cambias la
            definición de la plantilla, porque los datos antiguos podrían no pertenecer al nuevo campo.
          </p>
        ),
      },
      {
        id: 'atajos',
        title: 'Atajos',
        body: (
          <p>
            Usa los controles visibles del editor como fuente principal. Si un atajo no responde, revisa que el foco no
            esté dentro de un campo de texto o diálogo.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('search-fill'),
    sections: [
      {
        id: 'botones-principales',
        title: 'Botones principales',
        body: (
          <p>
            Search &amp; Fill conecta una fuente de datos, busca una fila, muestra coincidencias y rellena los campos
            revisados. Úsalo cuando el dato ya existe en una tabla, archivo o respuesta almacenada.
          </p>
        ),
      },
      {
        id: 'fuentes-soportadas',
        title: 'Fuentes de datos soportadas',
        body: (
          <ul>
            <li>CSV, XLSX y JSON pueden aportar filas.</li>
            <li>SQL y TXT ayudan a inferir esquema, pero no rellenan filas.</li>
            <li>Respuestas de Fill By Link pueden reutilizarse como registros.</li>
          </ul>
        ),
      },
      {
        id: 'formato-csv',
        title: 'Formato CSV',
        body: <p>Usa encabezados claros, una fila por registro y valores consistentes para fechas, casillas y opciones.</p>,
      },
      {
        id: 'formato-json',
        title: 'Formato JSON',
        body: <p>Prefiere objetos planos o listas de objetos con claves estables. Evita estructuras profundas si no necesitas anidamiento.</p>,
      },
      {
        id: 'formato-sql',
        title: 'Formato SQL',
        body: <p>SQL se usa para leer nombres de columnas y tipos esperados. No ejecuta consultas ni rellena filas dentro del navegador.</p>,
      },
      {
        id: 'formato-txt',
        title: 'Formato TXT',
        body: <p>TXT funciona como ayuda de esquema cuando solo necesitas nombres o instrucciones de campos.</p>,
      },
      {
        id: 'formato-excel',
        title: 'Formato Excel',
        body: <p>La primera fila debe contener encabezados estables. Revisa fechas y números porque Excel puede cambiar formatos visuales.</p>,
      },
      {
        id: 'flujo-de-relleno',
        title: 'Flujo de relleno',
        body: (
          <ol>
            <li>Carga la fuente.</li>
            <li>Elige una fila.</li>
            <li>Revisa campos coincidentes y no coincidentes.</li>
            <li>Aplica el relleno.</li>
            <li>Inspecciona el PDF antes de descargar.</li>
          </ol>
        ),
      },
      {
        id: 'controles-de-seguridad',
        title: 'Controles de seguridad',
        body: (
          <p>
            DullyPDF falla de forma cerrada cuando no encuentra campos coincidentes. Es mejor ver una advertencia que
            descargar un documento sin cambios creyendo que fue rellenado.
          </p>
        ),
      },
      {
        id: 'comparacion-de-flujos',
        title: 'Search & Fill vs Fill By Link vs API Fill',
        body: (
          <ul>
            <li>Search &amp; Fill: operador elige una fila en el navegador.</li>
            <li>Fill By Link: otra persona envía la respuesta por formulario web.</li>
            <li>API Fill: otro sistema envía JSON al backend.</li>
          </ul>
        ),
      },
      {
        id: 'heuristicas',
        title: 'Heurísticas de resolución de campos',
        body: (
          <p>
            Los nombres exactos son más confiables que coincidencias aproximadas. Usa Rename + Map si los encabezados y
            los nombres del PDF no se parecen.
          </p>
        ),
      },
      {
        id: 'casillas-y-alias',
        title: 'Casillas y alias',
        body: (
          <p>
            Para casillas, define valores aceptados y alias. Evita columnas con frases largas cuando la salida esperada
            es una marca simple.
          </p>
        ),
      },
      {
        id: 'rellenos-parciales',
        title: 'Por qué ocurren rellenos parciales',
        body: (
          <p>
            Un relleno parcial suele venir de nombres sin mapear, tipos incompatibles, datos vacíos o campos eliminados
            después de preparar el esquema. Revisa el resumen antes de descargar.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('fill-from-images'),
    sections: [
      {
        id: 'que-hace',
        title: 'Qué hace Fill from Images and Documents',
        body: (
          <p>
            Permite subir imágenes o documentos escaneados para extraer valores candidatos y colocarlos en campos del
            PDF revisado. Sirve cuando la información viene de IDs, facturas, recibos o documentos externos.
          </p>
        ),
      },
      {
        id: 'detalles-del-pipeline',
        title: 'Detalles del pipeline',
        body: (
          <p>
            Primero necesitas una plantilla con campos claros. Después subes las fuentes visuales, revisas las
            sugerencias y decides qué valores aplicar.
          </p>
        ),
      },
      {
        id: 'datos-enviados-openai',
        title: 'Qué se envía a OpenAI',
        body: (
          <p>
            La acción usa el contenido de los archivos que subes y la estructura necesaria para buscar valores
            coincidentes. No la uses con documentos que no deban pasar por un modelo externo.
          </p>
        ),
      },
      {
        id: 'costo-creditos',
        title: 'Costo en créditos',
        body: (
          <p>
            Cada imagen cuesta 1 crédito. Cada PDF cuesta 1 crédito por cada 5 páginas. Revisa el costo antes de subir
            lotes grandes.
          </p>
        ),
      },
      {
        id: 'buenas-practicas',
        title: 'Buenas prácticas',
        body: (
          <ul>
            <li>Usa imágenes legibles y sin reflejos.</li>
            <li>Sube solo documentos relevantes para la plantilla.</li>
            <li>Confirma valores críticos antes de guardar o descargar.</li>
            <li>No mezcles documentos de personas distintas en la misma prueba.</li>
          </ul>
        ),
      },
      {
        id: 'tipos-soportados',
        title: 'Tipos de archivo soportados',
        body: <p>Usa imágenes comunes y PDFs. Si una fuente no se procesa, conviértela a un formato estándar antes de repetir.</p>,
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('fill-by-link'),
    sections: [
      {
        id: 'que-se-publica',
        title: 'Qué se publica',
        body: (
          <p>
            Fill By Link publica un formulario web basado en una plantilla guardada o un grupo abierto. El destinatario
            no edita el PDF directamente; responde preguntas y DullyPDF genera el PDF a partir de esa respuesta.
          </p>
        ),
      },
      {
        id: 'flujo-del-propietario',
        title: 'Flujo del propietario',
        body: (
          <ol>
            <li>Guarda la plantilla.</li>
            <li>Abre el constructor de Fill By Link.</li>
            <li>Revisa preguntas, obligatorios y límites.</li>
            <li>Publica el link.</li>
            <li>Revisa respuestas antes de generar PDFs finales.</li>
          </ol>
        ),
      },
      {
        id: 'experiencia-del-destinatario',
        title: 'Qué ve el destinatario',
        body: (
          <p>
            El destinatario ve un formulario web, no un visor PDF complicado. Esto evita problemas de móviles,
            navegadores y estilos de campos editables.
          </p>
        ),
      },
      {
        id: 'salida-pdf',
        title: 'Salida PDF y compatibilidad',
        body: (
          <p>
            Para destinatarios externos, la salida plana suele ser la opción más confiable porque los valores quedan
            dibujados en la página y no dependen del visor PDF del destinatario.
          </p>
        ),
      },
      {
        id: 'revisar-respuestas',
        title: 'Revisar respuestas y generar PDFs',
        body: (
          <p>
            Las respuestas guardadas pueden usarse como fuente en Search &amp; Fill. Revisa cada registro importante
            antes de generar documentos finales o paquetes.
          </p>
        ),
      },
      {
        id: 'limites-y-publicacion',
        title: 'Límites y publicación',
        body: (
          <p>
            Gratis permite hasta {formatPlanLimitCount(FREE_PLAN_LIMITS.fillLinkResponsesMonthlyMax)} respuestas
            aceptadas por mes. Premium sube el límite a {formatPlanLimitCount(PREMIUM_PLAN_LIMITS.fillLinkResponsesMonthlyMax)}.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('signature-workflow'),
    sections: [
      {
        id: 'alcance-eeuu',
        title: 'Alcance disponible en EE. UU.',
        body: (
          <p>
            El flujo de firma de DullyPDF está documentado para casos de uso de Estados Unidos. No lo presentes como una
            solución legal general para otros países; revisa políticas y requisitos locales antes de usarlo fuera de ese
            alcance.
          </p>
        ),
      },
      {
        id: 'dos-rutas',
        title: 'Dos rutas de entrada',
        body: (
          <ul>
            <li>El propietario rellena o prepara un PDF y lo envía a firma.</li>
            <li>Un destinatario completa Fill By Link y luego pasa a una etapa de firma cuando el flujo de EE. UU. lo permite.</li>
          </ul>
        ),
      },
      {
        id: 'ceremonia-del-firmante',
        title: 'Ceremonia del firmante',
        body: (
          <p>
            El firmante revisa el documento congelado, completa los pasos requeridos y termina la acción dentro de una
            sesión pública controlada. El documento base no debe cambiar durante esa etapa.
          </p>
        ),
      },
      {
        id: 'artefactos',
        title: 'Artefactos y visibilidad del propietario',
        body: (
          <p>
            Al completarse, el propietario puede acceder a los archivos y evidencias retenidas del flujo. Esos registros
            ayudan a auditar qué documento se presentó y qué acciones se completaron.
          </p>
        ),
      },
      {
        id: 'guardrails',
        title: 'Límites y guardrails',
        body: (
          <p>
            DullyPDF no decide por ti si un documento pertenece a una categoría legal aceptable. El remitente es
            responsable de usar el flujo solo en documentos permitidos y revisados.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('api-fill'),
    sections: [
      {
        id: 'que-es-api-fill',
        title: 'Qué es API Fill',
        body: (
          <p>
            API Fill publica una instantánea de plantilla como endpoint backend. Otro sistema envía JSON y DullyPDF
            devuelve un PDF rellenado según los campos y reglas guardadas.
          </p>
        ),
      },
      {
        id: 'flujo-del-manager',
        title: 'Flujo del manager',
        body: (
          <ol>
            <li>Guarda la plantilla.</li>
            <li>Abre API Fill.</li>
            <li>Publica o rota la clave.</li>
            <li>Descarga el esquema.</li>
            <li>Prueba un payload pequeño antes de integrar producción.</li>
          </ol>
        ),
      },
      {
        id: 'payload',
        title: 'Payload y comportamiento de relleno',
        body: (
          <p>
            El JSON debe usar claves que coincidan con el esquema publicado. Los valores se aplican a la plantilla
            guardada; si cambias la plantilla, vuelve a revisar el esquema antes de enviar tráfico real.
          </p>
        ),
      },
      {
        id: 'cuando-usar-api',
        title: 'Cuándo usar API Fill',
        body: (
          <ul>
            <li>Usa API Fill cuando los datos vienen de un sistema interno.</li>
            <li>Usa Search &amp; Fill cuando un operador elige filas en el navegador.</li>
            <li>Usa Fill By Link cuando otra persona debe enviar los datos primero.</li>
          </ul>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('create-group'),
    sections: [
      {
        id: 'que-es-un-grupo',
        title: 'Qué es un grupo',
        body: (
          <p>
            Un grupo reúne plantillas guardadas que pertenecen al mismo paquete. Permite cambiar entre documentos y
            aplicar datos compartidos sin reconstruir cada PDF por separado.
          </p>
        ),
      },
      {
        id: 'crear-y-abrir',
        title: 'Crear y abrir grupos',
        body: (
          <p>
            Crea el grupo desde formularios guardados, agrega las plantillas correctas y abre el paquete desde el
            navegador de formularios. Mantén nombres claros para que el equipo entienda el orden del paquete.
          </p>
        ),
      },
      {
        id: 'rellenar-grupos',
        title: 'Search & Fill en grupos',
        body: (
          <p>
            Un registro puede rellenar varios PDFs del grupo. Los documentos sin coincidencias no deben consumir el
            mismo esfuerzo que los documentos mapeados correctamente.
          </p>
        ),
      },
      {
        id: 'rename-map-grupo',
        title: 'Rename + Map en todo el grupo',
        body: (
          <p>
            Usa batch Rename + Map cuando varias plantillas comparten un esquema. Revisa los resultados por documento
            antes de sobrescribir un paquete operativo.
          </p>
        ),
      },
      {
        id: 'reglas-de-paquete',
        title: 'Reglas de diseño de paquetes',
        body: (
          <ul>
            <li>Agrupa documentos que comparten el mismo registro.</li>
            <li>No mezcles paquetes con ciclos de aprobación diferentes.</li>
            <li>Prueba cada documento antes de probar el grupo completo.</li>
          </ul>
        ),
      },
      {
        id: 'fill-by-link-grupo',
        title: 'Fill By Link para grupos',
        body: (
          <p>
            Un grupo puede publicar un formulario combinado cuando varias plantillas necesitan la misma respuesta. La
            publicación debe revisarse con una respuesta de prueba antes de compartirla.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('save-download-profile'),
    sections: [
      {
        id: 'descargar-vs-guardar',
        title: 'Descargar vs guardar',
        body: (
          <p>
            Descargar produce un archivo de salida. Guardar conserva la plantilla para reutilizarla, publicarla,
            agruparla o conectarla a API Fill.
          </p>
        ),
      },
      {
        id: 'flujo-guardado',
        title: 'Flujo de formularios guardados',
        body: (
          <p>
            Al guardar, DullyPDF conserva campos, nombres, reglas, apariencia y snapshot del editor. Eso permite reabrir
            la plantilla sin repetir detección.
          </p>
        ),
      },
      {
        id: 'antes-de-publicar',
        title: 'Qué debe guardarse antes de publicar',
        body: (
          <p>
            Fill By Link, API Fill y grupos dependen de plantillas guardadas. Si el documento solo existe como edición
            temporal, publícalo después de guardar y validar.
          </p>
        ),
      },
      {
        id: 'fill-by-link-propietario',
        title: 'Flujo del propietario en Fill By Link',
        body: (
          <p>
            El propietario publica, comparte, revisa respuestas y genera PDFs. Las respuestas no reemplazan la plantilla;
            son registros que se aplican a ella.
          </p>
        ),
      },
      {
        id: 'limites-creditos',
        title: 'Límites y créditos',
        body: (
          <p>
            Gratis permite {formatPlanLimitCount(FREE_PLAN_LIMITS.savedFormsMax)} formularios guardados y
            {formatPlanLimitCount(FREE_PLAN_CREDITS.availableCredits)} créditos base. Premium permite
            {' '}{formatPlanLimitCount(PREMIUM_PLAN_LIMITS.savedFormsMax)} formularios y un pool mensual de
            {' '}{formatPlanLimitCount(PREMIUM_PLAN_CREDITS.monthlyCredits)} créditos.
          </p>
        ),
      },
      {
        id: 'planes-stripe',
        title: 'Planes y Stripe',
        body: (
          <p>
            Las compras y cancelaciones se gestionan desde Profile cuando la facturación está disponible. Revisa tu plan
            actual antes de asumir límites de producción.
          </p>
        ),
      },
      {
        id: 'reemplazar-o-nuevo',
        title: 'Reemplazar o guardar como nuevo',
        body: (
          <p>
            Reemplaza cuando estás corrigiendo la misma plantilla. Guarda como nuevo cuando el PDF base, el flujo o el
            esquema ya no representan el mismo proceso.
          </p>
        ),
      },
    ],
  },
  {
    ...getUsageDocsPageMetadata('troubleshooting'),
    sections: [
      {
        id: 'por-etapa',
        title: 'Diagnosticar por etapa',
        body: (
          <p>
            Empieza por la etapa donde aparece el problema: subida, detección, renombrado, mapeo, relleno, publicación o
            descarga. Mezclar etapas alarga el diagnóstico.
          </p>
        ),
      },
      {
        id: 'problemas-deteccion',
        title: 'Problemas de detección',
        body: (
          <ul>
            <li>Campos faltantes: crea campos manuales.</li>
            <li>Falsos positivos: elimina antes de mapear.</li>
            <li>Geometría incorrecta: redimensiona o redibuja.</li>
            <li>PDF borroso: prueba con una fuente de mejor calidad.</li>
          </ul>
        ),
      },
      {
        id: 'problemas-mapeo',
        title: 'Problemas de renombrado y mapeo',
        body: (
          <ul>
            <li>Columnas ambiguas producen coincidencias débiles.</li>
            <li>Nombres duplicados pueden rellenar campos equivocados.</li>
            <li>Casillas necesitan valores aceptados claros.</li>
            <li>Después de renombrar, vuelve a probar Search &amp; Fill.</li>
          </ul>
        ),
      },
      {
        id: 'problemas-salida',
        title: 'Problemas en la salida',
        body: (
          <p>
            Si la salida se ve vacía o incompleta, revisa primero si hubo coincidencias reales, si el campo sigue
            existiendo y si el visor PDF está mostrando campos editables de forma distinta.
          </p>
        ),
      },
      {
        id: 'mensajes-comunes',
        title: 'Mensajes comunes',
        body: (
          <ul>
            <li>Sin coincidencias: revisa nombres y mapeo.</li>
            <li>Límite mensual alcanzado: revisa Profile.</li>
            <li>Archivo no soportado: convierte a PDF, CSV, XLSX o JSON estándar.</li>
            <li>Sesión expirada: vuelve a cargar el flujo guardado.</li>
          </ul>
        ),
      },
      {
        id: 'antes-de-soporte',
        title: 'Qué capturar antes de soporte',
        body: (
          <ul>
            <li>Ruta exacta y hora aproximada.</li>
            <li>Tipo de archivo usado.</li>
            <li>Captura del campo o mensaje.</li>
            <li>Si el problema ocurrió antes o después de guardar.</li>
          </ul>
        ),
      },
      {
        id: 'soporte',
        title: 'Soporte',
        body: (
          <p>
            Si el problema persiste, reduce el caso a una plantilla, una fila y una acción. Ese caso mínimo facilita
            encontrar si el fallo está en el archivo, el mapeo, la cuenta o la generación del PDF.
          </p>
        ),
      },
    ],
  },
];

const PAGE_BY_KEY = new Map<UsageDocsPageKey, UsageDocsPage>(
  USAGE_DOCS_PAGES.map((page) => [page.key, page]),
);
const PAGE_BY_SLUG = new Map<string, UsageDocsPage>(
  USAGE_DOCS_PAGES.filter((page) => page.slug).map((page) => [page.slug, page]),
);

export const USAGE_DOCS_DEFAULT_PAGE_KEY: UsageDocsPageKey = 'index';

export const getUsageDocsPage = (pageKey: UsageDocsPageKey): UsageDocsPage =>
  PAGE_BY_KEY.get(pageKey) ?? PAGE_BY_KEY.get(USAGE_DOCS_DEFAULT_PAGE_KEY)!;

export const getUsageDocsPages = (): UsageDocsPage[] => USAGE_DOCS_PAGES;

export const usageDocsHref = (pageKey: UsageDocsPageKey): string => buildUsageDocsHref(pageKey);

export const resolveUsageDocsPath = (pathname: string): ResolvedUsageDocsPath | null => {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';

  if (normalizedPath === USAGE_DOCS_BASE_PATH) {
    return { kind: 'canonical', pageKey: USAGE_DOCS_DEFAULT_PAGE_KEY };
  }

  if (normalizedPath.startsWith(`${USAGE_DOCS_BASE_PATH}/`)) {
    const slugParts = normalizedPath.slice(`${USAGE_DOCS_BASE_PATH}/`.length).split('/').filter(Boolean);
    if (slugParts.length !== 1) {
      return { kind: 'not-found', requestedPath: normalizedPath };
    }
    const slug = slugParts[0];
    const page = PAGE_BY_SLUG.get(slug);
    if (page) {
      return { kind: 'canonical', pageKey: page.key };
    }
    return { kind: 'not-found', requestedPath: normalizedPath };
  }

  if (normalizedPath === '/usage-docs' || normalizedPath === '/docs') {
    return { kind: 'redirect', targetPath: USAGE_DOCS_BASE_PATH };
  }

  if (normalizedPath.startsWith('/usage-docs/')) {
    const suffix = normalizedPath.slice('/usage-docs'.length);
    return { kind: 'redirect', targetPath: `${USAGE_DOCS_BASE_PATH}${suffix}` };
  }

  if (normalizedPath.startsWith('/docs/')) {
    const suffix = normalizedPath.slice('/docs'.length);
    return { kind: 'redirect', targetPath: `${USAGE_DOCS_BASE_PATH}${suffix}` };
  }

  return null;
};
