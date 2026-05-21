const figureLibrary = {
  patientSource: {
    src: '/blog/patient-intake-source-1.webp',
    alt: 'Formulario PDF de admisión de paciente antes de limpiar campos en DullyPDF.',
  },
  patientRename: {
    src: '/blog/patient-intake-rename-1.webp',
    alt: 'Formulario PDF con campos renombrados para que el mapeo sea más claro.',
  },
  patientRemap: {
    src: '/blog/patient-intake-remap-1.webp',
    alt: 'Formulario PDF con campos mapeados a una fuente de datos estructurada.',
  },
  dentalIntake: {
    src: '/blog/dental-intake-form-1.webp',
    alt: 'Formulario dental fijo usado como ejemplo de PDF operativo repetido.',
  },
  homeworkDetected: {
    src: '/blog/homework-worksheet-detected-fields.webp',
    alt: 'Documento escolar con campos detectados sobre una página PDF fija.',
  },
  invoice: {
    src: '/blog/invoice-sample-1.webp',
    alt: 'Factura PDF con campos de cliente, conceptos, importes y totales.',
  },
  database: {
    src: '/seo/database-schema.webp',
    alt: 'Diagrama de esquema de datos para conectar JSON con una plantilla PDF.',
  },
  packet: {
    src: '/seo/pdf-packet-workflow-overview.webp',
    alt: 'Vista de flujo de paquete PDF para rellenar varios documentos desde un registro.',
  },
  link: {
    src: '/demo/mock-form.webp',
    alt: 'Formulario web de DullyPDF para capturar respuestas antes de generar un PDF.',
  },
  detection: {
    src: '/demo/mobile-commonforms.webp',
    alt: 'Vista móvil con detección de campos sobre un PDF en DullyPDF.',
  },
};

const figure = (key, caption) => ({
  ...figureLibrary[key],
  caption,
});

const section = (id, title, paragraphs, extras = {}) => ({
  id,
  title,
  paragraphs,
  ...(extras.bullets?.length ? { bullets: extras.bullets } : {}),
  ...(extras.figures?.length ? { figures: extras.figures } : {}),
  ...(extras.links?.length ? { links: extras.links } : {}),
});

const commonDocs = ['getting-started', 'detection', 'rename-mapping', 'search-fill'];

export const SPANISH_BLOG_POSTS = [
  {
    slug: 'como-crear-formulario-pdf-rellenable',
    title: 'Cómo Crear un Formulario PDF Rellenable desde un PDF Existente',
    seoTitle: 'Cómo Crear un Formulario PDF Rellenable | Guía en Español',
    seoDescription:
      'Guía práctica para convertir un PDF existente en un formulario PDF rellenable con campos revisados, nombres claros y una plantilla reutilizable.',
    seoKeywords: [
      'cómo crear un formulario pdf rellenable',
      'crear formulario pdf rellenable',
      'hacer pdf rellenable',
      'convertir pdf en formulario rellenable',
    ],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'El mejor punto de partida no es rediseñar el documento. Es tomar el PDF que el equipo ya usa, detectar campos, limpiar el resultado y guardar una plantilla que pueda rellenarse muchas veces.',
    sections: [
      section(
        'partir-del-pdf-existente',
        'Empieza con el PDF que ya usa el equipo',
        [
          'Muchas guías empiezan por diseñar un formulario nuevo. En operaciones reales, el documento ya existe: una admisión, solicitud, orden, factura o formato interno que debe conservar su aspecto.',
          'DullyPDF encaja cuando ese PDF debe convertirse en una plantilla. La página se mantiene fija, pero los campos encima del documento se pueden revisar, nombrar y reutilizar.',
        ],
        {
          figures: [
            figure('patientSource', 'El PDF original sigue siendo la base visual; el trabajo está en preparar una capa de campos confiable.'),
          ],
        },
      ),
      section(
        'detectar-y-revisar',
        'Detecta campos con IA y revisa antes de guardar',
        [
          'La detección automática acelera el primer borrador, pero no debe publicarse sin revisión. Confirma posiciones, tipos de campo, casillas y campos que quedaron duplicados o desplazados.',
          'Después renombra los campos con claves que una persona y un sistema puedan entender. Ese paso hace que Excel, CSV y API tengan una base más clara.',
        ],
        {
          bullets: [
            'Revisa campos de baja confianza primero.',
            'Corrige casillas y grupos de opciones.',
            'Usa nombres como cliente_nombre o fecha_solicitud, no Text1.',
          ],
        },
      ),
      section(
        'probar-plantilla',
        'Prueba la plantilla con un registro real',
        [
          'Una plantilla se considera lista cuando puedes rellenarla con un registro real, abrir el PDF generado y repetir el flujo sin pasos ocultos. Ese ciclo encuentra errores de texto largo, fechas, casillas y campos opcionales.',
          'Si el documento se usará varias veces, guarda la plantilla después de validar el primer resultado. Así el próximo PDF no requiere repetir detección y limpieza.',
        ],
      ),
      section(
        'siguiente-paso',
        'El siguiente paso depende de la fuente de datos',
        [
          'Si los datos viven en una hoja, continúa con Excel o CSV. Si otra persona debe enviar respuestas, usa Fill By Link. Si el origen ya es un sistema interno, API Fill es el camino natural después de validar la plantilla.',
        ],
        {
          links: [
            { label: 'Crear formulario PDF rellenable', href: '/es/crear-formulario-pdf-rellenable' },
            { label: 'Rellenar PDF desde Excel', href: '/es/rellenar-pdf-desde-excel' },
          ],
        },
      ),
    ],
    relatedIntentPages: ['es-create-fillable-pdf-form', 'es-ai-pdf-field-detection', 'es-reusable-pdf-template'],
    relatedDocs: commonDocs,
  },
  {
    slug: 'rellenar-pdf-desde-excel-guia',
    title: 'Cómo Rellenar un PDF desde Excel sin Copiar y Pegar',
    seoTitle: 'Rellenar PDF desde Excel | Guía Paso a Paso',
    seoDescription:
      'Aprende a preparar encabezados, mapear columnas y generar formularios PDF desde filas de Excel con una plantilla reutilizable.',
    seoKeywords: ['rellenar pdf desde excel', 'excel a pdf rellenable', 'llenar pdf con datos de excel', 'automatizar pdf desde excel'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'Excel funciona bien como fuente de datos si la plantilla PDF ya está limpia y los encabezados se pueden mapear a campos concretos.',
    sections: [
      section(
        'preparar-excel',
        'La hoja debe tener encabezados que parezcan campos',
        [
          'Antes de subir Excel, revisa los nombres de columna. Encabezados como Nombre, Fecha, Total o Responsable pueden funcionar, pero nombres más concretos reducen errores cuando el PDF crece.',
          'Una buena hoja separa cada dato que el PDF necesita. No mezcles dirección completa, contacto y notas en una misma columna si el documento tiene campos separados.',
        ],
        {
          figures: [
            figure('patientRemap', 'El mapeo se vuelve más confiable cuando las columnas de Excel tienen un destino claro en el PDF.'),
          ],
        },
      ),
      section(
        'mapear-columnas',
        'Mapea columnas a campos PDF una vez',
        [
          'El valor no está solo en llenar un PDF. Está en guardar la relación entre columnas y campos para que la siguiente fila, el siguiente archivo o el siguiente equipo no empiece desde cero.',
          'Después de mapear, prueba una fila real. Revisa campos largos, importes, fechas y valores vacíos antes de generar documentos finales.',
        ],
      ),
      section(
        'errores-comunes',
        'Errores comunes al pasar de Excel a PDF',
        [
          'Los problemas más frecuentes son encabezados duplicados, fechas con formato inconsistente, importes como texto y columnas que combinan varios datos. También conviene probar acentos y nombres largos.',
          'Si algo falla, corrige la hoja o el nombre del campo antes de culpar al PDF. El mapeo depende de que ambos lados expresen el dato de forma estable.',
        ],
        {
          bullets: [
            'Evita encabezados duplicados.',
            'Normaliza fechas antes de mapear.',
            'Mantén importes como valores claros.',
            'Prueba filas con campos vacíos.',
          ],
        },
      ),
      section(
        'cuando-usar-api',
        'Cuándo pasar de Excel a API',
        [
          'Excel es ideal para revisión humana y lotes controlados. Cuando el proceso ya está validado y los datos vienen de un sistema interno, API Fill evita que una persona tenga que exportar la hoja cada vez.',
        ],
        {
          links: [
            { label: 'Rellenar PDF desde Excel', href: '/es/rellenar-pdf-desde-excel' },
            { label: 'API para rellenar PDF', href: '/es/api-rellenar-pdf' },
          ],
        },
      ),
    ],
    relatedIntentPages: ['es-fill-pdf-from-excel', 'es-map-data-to-pdf', 'es-pdf-fill-api'],
    relatedDocs: ['search-fill', 'rename-mapping', 'api-fill'],
  },
  {
    slug: 'automatizar-formularios-pdf-clinicas',
    title: 'Automatizar Formularios PDF para Clínicas: Admisión, Historial y Registro',
    seoTitle: 'Automatización de Formularios PDF para Clínicas',
    seoDescription:
      'Cómo preparar plantillas PDF para admisión clínica, historial de paciente, seguros y registros usando datos estructurados.',
    seoKeywords: ['automatización de formularios pdf para clínicas', 'formularios pdf salud', 'rellenar formulario médico pdf', 'admisión clínica pdf'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'Las clínicas pueden mantener sus PDFs actuales y automatizar la colocación de datos de paciente, cita, seguro y revisión sin convertir cada documento en trabajo manual.',
    sections: [
      section(
        'documentos-clinicos',
        'Los formularios clínicos suelen ser paquetes, no un solo PDF',
        [
          'Un flujo de admisión puede incluir registro, historial, seguro, consentimiento y listas de revisión. Cada documento tiene un diseño distinto, pero muchos datos se repiten.',
          'La automatización útil empieza por elegir el paquete más frecuente y preparar campos estables. Después se puede ampliar a documentos cercanos sin perder control.',
        ],
        {
          figures: [
            figure('dentalIntake', 'Un formulario clínico fijo es un buen ejemplo de documento que necesita campos revisados antes de escalar.'),
          ],
        },
      ),
      section(
        'datos-paciente',
        'Separa paciente, cita, seguro y responsable',
        [
          'No uses un campo genérico de identificación para todo. Nombres como paciente_nombre, aseguradora, numero_poliza y medico_responsable ayudan a revisar qué dato va a cada región.',
          'Esa claridad también ayuda si la clínica empieza con Excel y después conecta un sistema de citas o CRM por API.',
        ],
      ),
      section(
        'captura-por-enlace',
        'Cuándo usar un enlace de captura',
        [
          'Si el paciente debe enviar datos antes de la visita, Fill By Link puede capturar respuestas en un formulario web y generar el PDF después. Recepción mantiene la revisión sin pedir que el paciente edite un PDF.',
          'Si el personal ya tiene todos los datos, Search & Fill desde una hoja puede ser más rápido para el primer despliegue.',
        ],
      ),
      section(
        'validacion',
        'Validación antes de usarlo en recepción',
        [
          'Prueba nombres largos, acentos, teléfonos, pólizas, casillas de historial y campos opcionales. Abre el PDF final en el visor que el equipo usa a diario.',
        ],
        {
          links: [{ label: 'Automatización PDF para clínicas', href: '/es/automatizacion-pdf-salud' }],
        },
      ),
    ],
    relatedIntentPages: ['es-healthcare-pdf-automation', 'es-fill-pdf-by-link', 'es-map-data-to-pdf'],
    relatedDocs: commonDocs,
  },
  {
    slug: 'formularios-pdf-recursos-humanos',
    title: 'Formularios PDF de Recursos Humanos: Cómo Automatizar Onboarding y Documentos de Empleado',
    seoTitle: 'Automatización PDF para Recursos Humanos',
    seoDescription:
      'Guía para convertir documentos de RR. HH. en plantillas PDF reutilizables para ingreso, beneficios, activos y datos de empleado.',
    seoKeywords: ['automatización pdf recursos humanos', 'formularios pdf rrhh', 'onboarding empleados pdf', 'rellenar formularios empleados pdf'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'RR. HH. suele copiar los mismos datos de empleado en varios documentos. Una plantilla PDF reutilizable reduce ese trabajo sin cambiar el paquete aprobado.',
    sections: [
      section(
        'paquete-ingreso',
        'El paquete de ingreso es el mejor primer caso',
        [
          'Un ingreso puede requerir datos personales, puesto, sede, beneficios, activos y políticas. Aunque cada PDF sea distinto, el registro base suele ser el mismo.',
          'Empieza por el paquete más común y valida que los nombres de campo sean entendibles para RR. HH., nómina y operaciones.',
        ],
        {
          figures: [
            figure('packet', 'Los paquetes PDF funcionan mejor cuando cada documento comparte nombres de campo consistentes.'),
          ],
        },
      ),
      section(
        'fuentes-rrhh',
        'Usa el HRIS, ATS o la hoja de ingreso como fuente',
        [
          'La automatización falla si los datos de origen todavía están incompletos. Escoge la fuente que el equipo ya considera confiable y úsala para mapear la plantilla.',
          'Campos como nombre_empleado, fecha_ingreso, puesto, sede y jefe_directo deben existir por separado si aparecen en distintos documentos.',
        ],
      ),
      section(
        'enlace-empleado',
        'Cuándo conviene capturar datos del empleado',
        [
          'Si el empleado debe confirmar datos personales, un enlace de captura puede ser más controlado que enviar PDFs editables. Después RR. HH. revisa respuestas, conserva la plantilla interna y genera el documento final.',
          'Para lotes de ingreso ya revisados, Excel o CSV pueden ser suficientes porque el equipo ya controla los datos y solo necesita generar el paquete final.',
        ],
      ),
      section(
        'revision-final',
        'Revisa antes de entregar el paquete',
        [
          'Prueba empleados con dos apellidos, direcciones largas, fechas, beneficios opcionales y activos. Después genera una salida plana para confirmar que se ve igual fuera del editor.',
        ],
        {
          links: [{ label: 'Automatización PDF para recursos humanos', href: '/es/automatizacion-pdf-recursos-humanos' }],
        },
      ),
    ],
    relatedIntentPages: ['es-hr-pdf-automation', 'es-pdf-packet-workflow', 'es-fill-pdf-from-excel'],
    relatedDocs: commonDocs,
  },
  {
    slug: 'mapear-campos-pdf-a-excel',
    title: 'Mapear Campos PDF a Excel: Nombres, Columnas y Validación',
    seoTitle: 'Mapear Campos PDF a Excel | Guía en Español',
    seoDescription:
      'Cómo nombrar campos PDF y columnas de Excel para que el relleno automático sea más estable y fácil de revisar.',
    seoKeywords: ['mapear campos pdf a excel', 'mapear datos a pdf', 'columnas excel a pdf', 'campos pdf para excel'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'El mapeo es el contrato entre la hoja y el PDF. Si los nombres de campo y las columnas son claros, el resto del flujo se vuelve más confiable.',
    sections: [
      section(
        'nombres-campos',
        'Un buen nombre de campo explica el dato esperado',
        [
          'Nombres como Text1 o field_7 obligan a adivinar. Nombres como cliente_nombre, fecha_inicio o total_factura ayudan a mapear y revisar.',
          'La claridad importa más cuando varias personas reutilizan la plantilla o cuando se pasa de Excel a API.',
        ],
        {
          figures: [
            figure('patientRename', 'Renombrar campos convierte una plantilla técnica en una plantilla operativa.'),
          ],
        },
      ),
      section(
        'columnas',
        'Las columnas deben representar datos separados',
        [
          'Si el PDF tiene campos para calle, ciudad y código postal, la hoja también debería separar esos datos. Las columnas combinadas crean reglas manuales difíciles de mantener.',
          'También conviene evitar encabezados duplicados y abreviaturas que solo una persona entiende.',
        ],
      ),
      section(
        'validacion',
        'Valida con filas difíciles',
        [
          'No pruebes solo el registro más limpio. Usa nombres largos, valores vacíos, importes, fechas y acentos. Esas filas encuentran problemas antes de que el equipo confíe en la plantilla.',
        ],
        {
          bullets: [
            'Una fila con texto largo.',
            'Una fila con campos opcionales vacíos.',
            'Una fila con fecha e importe.',
            'Una fila con caracteres acentuados.',
          ],
        },
      ),
      section(
        'rutas',
        'El mismo mapeo puede servir para CSV o API',
        [
          'Cuando los nombres son estables, cambiar de Excel a CSV o API es más simple. El documento no cambia; cambia la fuente que entrega los valores.',
        ],
        {
          links: [
            { label: 'Mapear datos a PDF', href: '/es/mapear-datos-a-pdf' },
            { label: 'Rellenar PDF desde Excel', href: '/es/rellenar-pdf-desde-excel' },
          ],
        },
      ),
    ],
    relatedIntentPages: ['es-map-data-to-pdf', 'es-fill-pdf-from-excel', 'es-ai-pdf-field-renaming'],
    relatedDocs: ['rename-mapping', 'search-fill'],
  },
  {
    slug: 'plantillas-pdf-reutilizables',
    title: 'Plantillas PDF Reutilizables: Cómo Evitar Preparar el Mismo Documento Otra Vez',
    seoTitle: 'Plantillas PDF Reutilizables para Formularios',
    seoDescription:
      'Cómo guardar campos, nombres y mapeos en una plantilla PDF reutilizable para flujos repetidos de Excel, CSV, enlaces o API.',
    seoKeywords: ['plantilla pdf reutilizable', 'pdf rellenable reutilizable', 'guardar formulario pdf rellenable', 'reutilizar formulario pdf'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'La diferencia entre una conversión rápida y una operación estable es guardar una plantilla que otros puedan reabrir, probar y rellenar sin repetir el setup.',
    sections: [
      section(
        'conversion-vs-plantilla',
        'Una conversión no es lo mismo que una plantilla',
        [
          'Convertir un PDF una vez ayuda poco si el documento volverá a aparecer. Una plantilla conserva campos, nombres y mapeos para que el próximo relleno empiece desde una base revisada.',
          'Ese enfoque es especialmente útil en clínicas, RR. HH., compras, finanzas y operaciones, donde los documentos se repiten con datos distintos.',
        ],
        {
          figures: [
            figure('patientSource', 'El PDF base se mantiene; la plantilla guarda la capa de campos y mapeo encima.'),
          ],
        },
      ),
      section(
        'que-guardar',
        'Qué debe quedar estable antes de guardar',
        [
          'Revisa que existan todos los campos requeridos, que los nombres sean claros y que el mapeo con datos de ejemplo funcione. Una plantilla guardada con errores solo repite errores más rápido.',
          'También conviene abrir una salida plana y una editable para confirmar que el resultado es aceptable para el equipo.',
        ],
      ),
      section(
        'reutilizacion',
        'La reutilización reduce trabajo entre ciclos',
        [
          'Cuando llega un nuevo archivo Excel o un nuevo payload JSON, el equipo no debería redibujar campos. Debería abrir la plantilla, revisar datos y generar el documento.',
        ],
      ),
      section(
        'expandir',
        'Expande una plantilla a un paquete solo después de validarla',
        [
          'Si varios documentos comparten datos, primero estabiliza cada plantilla. Después conecta el conjunto a un registro común para generar paquetes PDF.',
        ],
        {
          links: [
            { label: 'Plantilla PDF reutilizable', href: '/es/plantilla-pdf-reutilizable' },
            { label: 'Rellenar paquetes PDF', href: '/es/rellenar-paquetes-pdf' },
          ],
        },
      ),
    ],
    relatedIntentPages: ['es-reusable-pdf-template', 'es-pdf-packet-workflow', 'es-create-fillable-pdf-form'],
    relatedDocs: commonDocs,
  },
  {
    slug: 'rellenar-pdf-por-enlace',
    title: 'Rellenar un PDF por Enlace: Cuándo Usar Fill By Link',
    seoTitle: 'Rellenar PDF por Enlace | Fill By Link en Español',
    seoDescription:
      'Cuándo publicar un enlace para capturar respuestas y generar un PDF final desde una plantilla, sin enviar el PDF editable.',
    seoKeywords: ['rellenar pdf por enlace', 'formulario pdf con link', 'link para llenar formulario pdf', 'formulario web a pdf'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'Un enlace de captura funciona cuando otra persona debe aportar datos, pero el equipo quiere mantener el control de la plantilla PDF final.',
    sections: [
      section(
        'por-que-enlace',
        'El enlace separa captura de documento final',
        [
          'Enviar un PDF editable suele producir versiones difíciles de revisar. Con Fill By Link, la persona responde en una experiencia web y DullyPDF coloca esas respuestas en el PDF final.',
          'Eso es útil para admisiones, altas de proveedor, solicitudes, datos de empleado o cualquier flujo donde el destinatario no debe modificar la plantilla.',
        ],
        {
          figures: [
            figure('link', 'La captura por enlace mantiene el PDF como salida y usa un formulario web para recopilar datos.'),
          ],
        },
      ),
      section(
        'preparar-campos',
        'Prepara solo los campos que necesitas capturar',
        [
          'No todas las regiones del PDF tienen que aparecer en el enlace. Algunos campos pueden venir de una hoja o del sistema interno, mientras otros se capturan desde la persona externa.',
          'Define preguntas claras y evita campos obligatorios que el usuario no pueda responder con confianza.',
        ],
      ),
      section(
        'revision',
        'Revisa respuestas antes de usar el flujo en producción',
        [
          'Prueba el enlace en móvil y escritorio. Responde con textos largos, valores vacíos y datos con acentos. Después genera el PDF y abre la salida final.',
        ],
      ),
      section(
        'cuando-no-usarlo',
        'Cuándo no usar un enlace',
        [
          'Si el equipo ya tiene todos los datos en Excel o en un sistema interno, Search & Fill o API Fill pueden ser más directos. Usa el enlace cuando la captura externa sea parte real del proceso.',
        ],
        {
          links: [{ label: 'Formulario PDF con link', href: '/es/formulario-pdf-con-link' }],
        },
      ),
    ],
    relatedIntentPages: ['es-fill-pdf-by-link', 'es-create-fillable-pdf-form', 'es-map-data-to-pdf'],
    relatedDocs: ['fill-by-link', 'getting-started'],
  },
  {
    slug: 'api-para-rellenar-pdf',
    title: 'API para Rellenar PDFs: Cómo Preparar la Plantilla antes de Integrar',
    seoTitle: 'API para Rellenar PDF desde JSON',
    seoDescription:
      'Qué revisar antes de conectar una API para rellenar PDFs: plantilla, nombres de campo, mapeo, JSON de prueba y validación.',
    seoKeywords: ['api para rellenar pdf', 'rellenar pdf con api', 'json a pdf api', 'generar pdf desde json'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'La API funciona mejor cuando la plantilla ya fue probada manualmente. Primero estabiliza campos y mapeos; después conecta JSON de producción.',
    sections: [
      section(
        'antes-api',
        'No empieces por la API si la plantilla aún cambia',
        [
          'Una integración no arregla campos mal nombrados, casillas confusas o posiciones desplazadas. Si la plantilla no es estable, la API solo hará que los errores aparezcan más rápido.',
          'El orden más sano es preparar la plantilla, probarla con datos reales y después automatizar la generación desde el sistema interno.',
        ],
        {
          figures: [
            figure('database', 'La API necesita un contrato claro entre claves JSON y campos PDF.'),
          ],
        },
      ),
      section(
        'contrato-json',
        'Diseña el JSON como contrato',
        [
          'Cada clave del JSON debe tener un destino claro. Usa nombres que duren, no nombres copiados de una pantalla temporal.',
          'También prueba campos faltantes, valores nulos, importes, fechas y textos largos. Esos casos definen si la integración es robusta.',
        ],
      ),
      section(
        'pruebas',
        'Prueba con payloads representativos',
        [
          'No valides solo una respuesta feliz. Prueba un documento completo, uno con datos opcionales vacíos y otro con valores largos. Abre cada PDF generado y compara contra el registro de origen.',
        ],
      ),
      section(
        'paso-previo',
        'Excel o CSV pueden ser el paso previo',
        [
          'Si el equipo todavía está validando campos, Search & Fill desde Excel o CSV es una forma rápida de probar la plantilla antes de codificar la integración.',
        ],
        {
          links: [
            { label: 'API para rellenar PDF', href: '/es/api-rellenar-pdf' },
            { label: 'Rellenar PDF desde CSV', href: '/es/rellenar-pdf-desde-csv' },
          ],
        },
      ),
    ],
    relatedIntentPages: ['es-pdf-fill-api', 'es-map-data-to-pdf', 'es-fill-pdf-from-csv'],
    relatedDocs: ['api-fill', 'rename-mapping', 'search-fill'],
  },
  {
    slug: 'paquetes-pdf-desde-una-fila',
    title: 'Cómo Rellenar Varios PDFs desde una Sola Fila',
    seoTitle: 'Rellenar Paquetes PDF desde una Fila',
    seoDescription:
      'Cómo preparar plantillas relacionadas para que una sola fila de Excel, CSV o JSON pueda generar varios PDFs del mismo expediente.',
    seoKeywords: ['rellenar paquetes pdf', 'llenar varios pdf con una fila', 'paquete pdf desde excel', 'varios formularios pdf desde datos'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'Los paquetes PDF funcionan cuando varios documentos comparten un registro. La clave es usar nombres consistentes y validar cada plantilla antes de juntar el conjunto.',
    sections: [
      section(
        'definir-paquete',
        'Un paquete es un grupo de plantillas relacionadas',
        [
          'No todos los PDFs deben unirse desde el inicio. Primero identifica qué documentos pertenecen al mismo expediente y qué datos comparten.',
          'Por ejemplo, un paquete de ingreso puede compartir nombre, documento, fecha, sede y responsable entre varios formularios.',
        ],
        {
          figures: [
            figure('packet', 'El flujo de paquete depende de plantillas individuales que comparten un mismo registro de datos.'),
          ],
        },
      ),
      section(
        'nombres-consistentes',
        'Usa nombres comunes para datos comunes',
        [
          'Si persona_nombre significa una cosa en un PDF y otra en el siguiente, el paquete será frágil. Los datos compartidos deben tener el mismo significado en todas las plantillas.',
          'Los campos específicos pueden tener prefijos propios, pero el núcleo del registro debe mantenerse estable.',
        ],
      ),
      section(
        'probar-individual',
        'Prueba cada documento antes del paquete completo',
        [
          'Un error pequeño en una plantilla puede contaminar todo el paquete. Valida cada PDF con el mismo registro y después revisa el conjunto completo.',
        ],
        {
          bullets: [
            'Validar cada plantilla por separado.',
            'Revisar campos compartidos.',
            'Generar un paquete de prueba.',
            'Abrir cada PDF final.',
          ],
        },
      ),
      section(
        'casos',
        'Casos donde una fila puede generar varios PDFs',
        [
          'Admisiones, onboarding, préstamos, compras y expedientes operativos suelen repetir datos entre documentos. Esos flujos son buenos candidatos después de estabilizar las plantillas individuales.',
        ],
        {
          links: [{ label: 'Rellenar paquetes PDF', href: '/es/rellenar-paquetes-pdf' }],
        },
      ),
    ],
    relatedIntentPages: ['es-pdf-packet-workflow', 'es-reusable-pdf-template', 'es-fill-pdf-from-excel'],
    relatedDocs: ['create-group', 'search-fill', 'rename-mapping'],
  },
  {
    slug: 'detectar-campos-pdf-con-ia',
    title: 'Detectar Campos PDF con IA: Qué Revisar antes de Confiar en la Plantilla',
    seoTitle: 'Detectar Campos PDF con IA | Guía en Español',
    seoDescription:
      'Cómo usar detección automática de campos PDF y qué revisar antes de guardar una plantilla rellenable para producción.',
    seoKeywords: ['detectar campos pdf con ia', 'detección de campos pdf', 'campos de formulario pdf ia', 'pdf a formulario con ia'],
    publishedDate: '2026-05-21',
    updatedDate: '2026-05-21',
    author: 'DullyPDF Team',
    summary:
      'La detección con IA acelera el borrador, pero la plantilla solo es confiable después de revisar campos, casillas, nombres y una salida de prueba.',
    sections: [
      section(
        'borrador',
        'La detección crea un borrador, no una plantilla final',
        [
          'Un detector puede encontrar líneas, cajas y regiones probables, pero no conoce todas las reglas operativas del documento. La revisión humana sigue siendo necesaria.',
          'El objetivo es pasar de dibujar todo manualmente a corregir un borrador razonable.',
        ],
        {
          figures: [
            figure('detection', 'La detección automática ayuda a ubicar campos candidatos, pero el operador debe revisar el resultado.'),
          ],
        },
      ),
      section(
        'que-revisar',
        'Qué revisar primero',
        [
          'Empieza por campos de baja confianza, casillas cercanas, campos duplicados y zonas donde el texto quedó desplazado. Después revisa que todos los campos importantes existan.',
          'Los PDFs escaneados, densos o con tablas pueden requerir más limpieza que documentos nativos con líneas claras.',
        ],
        {
          bullets: [
            'Campos faltantes.',
            'Casillas mal agrupadas.',
            'Campos duplicados.',
            'Texto largo sin espacio suficiente.',
          ],
        },
      ),
      section(
        'nombres',
        'Después de detectar, renombra',
        [
          'La detección encuentra regiones; el renombrado convierte esas regiones en campos útiles para el equipo. Usa nombres que indiquen el dato esperado y que puedan mapearse desde una fuente.',
        ],
      ),
      section(
        'prueba',
        'La prueba final es rellenar un registro real',
        [
          'Una plantilla detectada solo está lista cuando puede rellenarse con un registro real y producir un PDF que el equipo pueda revisar sin pasos ocultos.',
        ],
        {
          links: [
            { label: 'Detectar campos PDF con IA', href: '/es/detectar-campos-pdf-ia' },
            { label: 'Renombrar campos PDF con IA', href: '/es/renombrar-campos-pdf-ia' },
          ],
        },
      ),
    ],
    relatedIntentPages: ['es-ai-pdf-field-detection', 'es-ai-pdf-field-renaming', 'es-create-fillable-pdf-form'],
    relatedDocs: ['detection', 'editor-workflow', 'rename-mapping'],
  },
];
