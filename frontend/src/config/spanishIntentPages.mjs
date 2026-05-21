const commonSpanishDocs = ['getting-started', 'detection', 'rename-mapping', 'search-fill', 'fill-by-link', 'api-fill'];

export const SPANISH_INDUSTRY_INTENT_PAGE_KEYS = [
  'es-healthcare-pdf-automation',
  'es-hr-pdf-automation',
  'es-real-estate-pdf-automation',
  'es-education-pdf-automation',
  'es-finance-loan-pdf-automation',
  'es-logistics-pdf-automation',
  'es-accounting-invoice-pdf-automation',
  'es-construction-pdf-automation',
  'es-field-service-pdf-automation',
  'es-procurement-pdf-automation',
];

export const SPANISH_WORKFLOW_INTENT_PAGE_KEYS = [
  'es-create-fillable-pdf-form',
  'es-fill-pdf-from-excel',
  'es-fill-pdf-from-csv',
  'es-fill-pdf-by-link',
  'es-pdf-fill-api',
  'es-ai-pdf-field-detection',
  'es-ai-pdf-field-renaming',
  'es-map-data-to-pdf',
  'es-reusable-pdf-template',
  'es-pdf-packet-workflow',
];

const toSentenceList = (items) => {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
};

const workflowSupportLinks = [
  { label: 'Crear formulario PDF rellenable', href: '/es/crear-formulario-pdf-rellenable' },
  { label: 'Rellenar PDF desde Excel', href: '/es/rellenar-pdf-desde-excel' },
  { label: 'Rellenar PDF por enlace', href: '/es/formulario-pdf-con-link' },
  { label: 'API para rellenar PDF', href: '/es/api-rellenar-pdf' },
];

const industrySupportLinks = [
  { label: 'Clínicas y salud', href: '/es/automatizacion-pdf-salud' },
  { label: 'Recursos humanos', href: '/es/automatizacion-pdf-recursos-humanos' },
  { label: 'Contabilidad y facturas', href: '/es/automatizacion-pdf-contabilidad-facturas' },
  { label: 'Logística y operaciones', href: '/es/automatizacion-pdf-logistica' },
];

const buildSpanishIndustryPage = (page) => {
  const documentExamples = toSentenceList(page.documentExamples);
  const sourceRecords = toSentenceList(page.sourceRecords);

  return {
    key: page.key,
    category: 'industry',
    path: page.path,
    navLabel: page.navLabel,
    heroTitle: page.heroTitle,
    heroSummary: page.heroSummary,
    seoTitle: page.seoTitle ?? `${page.heroTitle} | DullyPDF en español`,
    seoDescription: page.seoDescription ?? page.heroSummary,
    seoKeywords: page.seoKeywords,
    valuePoints: page.valuePoints,
    proofPoints: page.proofPoints,
    articleSections: [
      {
        title: `${page.navLabel}: automatizar PDFs sin cambiar formatos aprobados`,
        paragraphs: [
          page.localContext,
          `El conjunto de documentos rara vez es un solo archivo. Normalmente incluye ${documentExamples}. DullyPDF funciona mejor cuando esos formatos ya están aprobados y el equipo solo necesita colocar datos variables en las mismas posiciones una y otra vez.`,
        ],
        bullets: page.documentExamples,
      },
      {
        title: `Mapear datos de ${page.shortWorkflowLabel} antes de subir el volumen`,
        paragraphs: [
          `Empieza con la fuente que el equipo ya usa como registro principal: ${sourceRecords}. Después sube un CSV, Excel, JSON o esquema de texto representativo y alinea esos encabezados con campos PDF revisados.`,
          page.mappingContext,
        ],
        bullets: page.fieldExamples,
      },
      {
        title: `Elegir el flujo correcto para ${page.shortWorkflowLabel}`,
        paragraphs: [
          page.runtimeContext,
          'Search & Fill es el primer paso más controlado cuando un operador debe revisar una fila y comparar el resultado. Fill By Link sirve cuando otra persona debe capturar respuestas desde un formulario web. API Fill es el camino de producción cuando un sistema interno ya puede enviar JSON limpio a una plantilla guardada.',
        ],
      },
      {
        title: `Validar la plantilla de ${page.shortWorkflowLabel} antes de publicarla`,
        paragraphs: [
          page.rolloutContext,
          'Un despliegue sano empieza con una familia de documentos, un registro real, una salida revisada y después plantillas cercanas. Ese orden evita convertir la automatización PDF en una colección de páginas sueltas sin una operación repetible detrás.',
        ],
        bullets: page.qaChecks,
      },
      {
        title: 'Mantener políticas internas fuera de la herramienta PDF',
        paragraphs: [
          page.boundaryContext,
          'DullyPDF ayuda a detectar campos, renombrarlos, mapear valores, guardar plantillas y generar salidas. La decisión sobre qué datos recopilar, quién aprueba un expediente o qué revisión normativa aplica debe seguir en el proceso de la organización.',
        ],
      },
    ],
    supportSections: [
      {
        title: 'Flujos de DullyPDF relacionados',
        paragraphs: [
          'Estas páginas en español conectan cada caso de industria con la mecánica reutilizable del producto: detección de campos, mapeo, Fill By Link, Search & Fill y API Fill.',
        ],
        links: workflowSupportLinks,
      },
    ],
    faqs: [
      {
        question: `¿DullyPDF puede automatizar PDFs de ${page.faqSubject}?`,
        answer: `Sí. Sube el PDF existente, revisa los campos detectados, asigna nombres claros, mapea la plantilla a ${page.faqSourceLabel} y rellénala desde Excel, CSV, respuestas por enlace o API.`,
      },
      {
        question: `¿Qué datos conviene preparar primero para ${page.shortWorkflowLabel}?`,
        answer: page.sourceDataAnswer,
      },
      {
        question: `¿La salida de ${page.shortWorkflowLabel} debe ser editable o plana?`,
        answer: page.outputAnswer,
      },
    ],
    relatedIntentPages: SPANISH_INDUSTRY_INTENT_PAGE_KEYS.filter((key) => key !== page.key),
    relatedDocs: commonSpanishDocs,
  };
};

const buildSpanishWorkflowPage = (page) => ({
  key: page.key,
  category: 'workflow',
  path: page.path,
  navLabel: page.navLabel,
  heroTitle: page.heroTitle,
  heroSummary: page.heroSummary,
  seoTitle: page.seoTitle ?? `${page.heroTitle} | DullyPDF en español`,
  seoDescription: page.seoDescription ?? page.heroSummary,
  seoKeywords: page.seoKeywords,
  valuePoints: page.valuePoints,
  proofPoints: page.proofPoints,
  articleSections: [
    {
      title: `${page.navLabel} empieza con una plantilla estable`,
      paragraphs: [
        page.setupContext,
        `El objetivo no es editar visualmente el documento cada vez. El objetivo es guardar una plantilla PDF con campos revisados para que ${page.workflowOutcome} pueda repetirse con menos trabajo manual.`,
      ],
      bullets: page.setupSteps,
    },
    {
      title: `Preparar datos para ${page.shortWorkflowLabel}`,
      paragraphs: [
        page.dataContext,
        `Los mejores resultados aparecen cuando los encabezados tienen nombres concretos. En vez de usar columnas genéricas, conviene separar valores como ${toSentenceList(page.fieldExamples)} para que el mapeo sea auditable.`,
      ],
      bullets: page.fieldExamples,
    },
    {
      title: `Cuándo usar este flujo de ${page.shortWorkflowLabel}`,
      paragraphs: [
        page.runtimeContext,
        'Si todavía hay incertidumbre, prueba una fila real en Search & Fill. Si el equipo necesita capturar datos externos, usa Fill By Link. Si el origen ya es un sistema interno, usa API Fill después de revisar la plantilla con ejemplos representativos.',
      ],
    },
    {
      title: `Control de calidad para ${page.shortWorkflowLabel}`,
      paragraphs: [
        page.qaContext,
        'La validación mínima es abrir la salida, revisar campos largos, confirmar casillas y repetir la misma operación con otro registro. Si el resultado depende de recordar un arreglo manual, la plantilla todavía no está lista para producción.',
      ],
      bullets: page.qaChecks,
    },
    {
      title: 'Cómo encaja este flujo con el resto de DullyPDF',
      paragraphs: [
        page.productContext,
        'Las páginas en español se enfocan en formularios PDF rellenables, datos estructurados, enlaces de captura, API y plantillas reutilizables para operaciones repetidas.',
      ],
    },
  ],
  supportSections: [
    {
      title: 'Soluciones por industria relacionadas',
      paragraphs: [
        'Después de validar el flujo, revisa cómo se aplica a equipos que trabajan con documentos recurrentes en salud, RR. HH., finanzas, compras, logística y operaciones.',
      ],
      links: industrySupportLinks,
    },
  ],
  faqs: [
    {
      question: `¿Para qué sirve ${page.navLabel}?`,
      answer: page.faqPurpose,
    },
    {
      question: `¿Necesito rediseñar el PDF para usar ${page.shortWorkflowLabel}?`,
      answer: 'No. El flujo parte de un PDF existente. Revisas los campos sobre la página fija y guardas una plantilla reutilizable sin rediseñar el documento desde cero.',
    },
    {
      question: `¿Puedo usar ${page.shortWorkflowLabel} con Excel, CSV o API?`,
      answer: page.faqDataSource,
    },
  ],
  relatedIntentPages: SPANISH_WORKFLOW_INTENT_PAGE_KEYS.filter((key) => key !== page.key),
  relatedDocs: commonSpanishDocs,
});

export const SPANISH_INDUSTRY_INTENT_PAGES = [
  buildSpanishIndustryPage({
    key: 'es-healthcare-pdf-automation',
    path: '/es/automatizacion-pdf-salud',
    navLabel: 'Automatización PDF para clínicas',
    heroTitle: 'Automatización de Formularios PDF para Clínicas y Salud',
    heroSummary:
      'Convierte formularios de admisión, historial, consentimiento y registro en plantillas PDF reutilizables que se rellenan desde Excel, enlaces o API.',
    seoKeywords: [
      'automatización de formularios pdf para clínicas',
      'formularios pdf salud',
      'rellenar formulario médico pdf',
      'formulario de admisión clínica pdf',
      'automatizar pdf pacientes',
      'plantilla pdf clínica',
    ],
    valuePoints: [
      'Estandariza admisión, historial, autorizaciones y registros sin cambiar el PDF aprobado.',
      'Mapea datos de pacientes, pólizas, citas y responsables a campos claros.',
      'Genera salidas planas para revisión, archivo o envío fuera de DullyPDF.',
    ],
    proofPoints: [
      'Search & Fill permite revisar pacientes desde CSV, Excel, JSON o TXT.',
      'Fill By Link captura respuestas antes de que el personal genere el PDF.',
      'La detección ayuda con PDFs escaneados o formularios nativos densos.',
    ],
    documentExamples: ['admisiones de pacientes', 'historiales clínicos', 'consentimientos', 'formularios de seguro', 'listas de revisión'],
    sourceRecords: ['hojas de recepción', 'sistemas de citas', 'CRM de pacientes', 'exportaciones de aseguradora'],
    fieldExamples: ['nombre_paciente', 'fecha_nacimiento', 'telefono', 'aseguradora', 'numero_poliza', 'medico_responsable'],
    shortWorkflowLabel: 'admisión clínica',
    localContext:
      'Las clínicas suelen conservar PDFs fijos porque el equipo ya conoce el formato y los pacientes o aseguradoras esperan ver la misma estructura. El cuello de botella aparece cuando recepción vuelve a escribir datos de la cita, el seguro y el paciente en documentos que se repiten todos los días.',
    mappingContext:
      'Nombra los campos sensibles de forma explícita para que el equipo sepa qué dato entra en cada región del PDF. Evita campos como "dato1" o "id" cuando el documento necesita distinguir paciente, póliza, responsable y fecha de atención.',
    runtimeContext:
      'Las clínicas suelen empezar con Search & Fill porque recepción necesita comparar datos antes de generar el documento. Fill By Link encaja cuando el paciente debe enviar datos antes de la visita, y API Fill cuando el sistema de citas ya tiene la información validada.',
    rolloutContext:
      'Empieza con un paquete de admisión frecuente y valida nombres largos, direcciones, teléfonos, casillas de historial y campos opcionales. Después extiende el mismo esquema a consentimientos y formularios de seguimiento.',
    qaChecks: ['Probar nombres largos y acentos.', 'Confirmar casillas de historial y alergias.', 'Verificar datos de póliza y responsable.', 'Abrir una salida plana en el visor usado por el equipo.'],
    boundaryContext:
      'Los flujos de salud pueden contener información sensible. La organización debe definir permisos, retención y revisión clínica antes de usar cualquier plantilla para producción.',
    faqSubject: 'clínicas y salud',
    faqSourceLabel: 'datos de paciente, cita, seguro y revisión',
    sourceDataAnswer:
      'Empieza con la hoja o sistema que recepción ya considera confiable: citas, registro de pacientes o exportación de aseguradora con columnas separadas para paciente, contacto, póliza y responsable.',
    outputAnswer:
      'Usa editable mientras limpias la plantilla. Usa plano cuando el documento ya fue revisado y debe compartirse o archivarse sin cambios accidentales.',
  }),
  buildSpanishIndustryPage({
    key: 'es-hr-pdf-automation',
    path: '/es/automatizacion-pdf-recursos-humanos',
    navLabel: 'Automatización PDF para recursos humanos',
    heroTitle: 'Automatización de Formularios PDF para Recursos Humanos',
    heroSummary:
      'Rellena paquetes de ingreso, beneficios, políticas, activos y datos de empleado desde Excel, enlaces o sistemas internos.',
    seoKeywords: [
      'automatización pdf recursos humanos',
      'formularios pdf rrhh',
      'rellenar formularios empleados pdf',
      'plantilla pdf onboarding empleados',
      'automatizar documentos de recursos humanos',
    ],
    valuePoints: [
      'Convierte paquetes de ingreso en plantillas reutilizables por rol, sede o entidad.',
      'Mapea datos de empleado, puesto, salario, contacto y responsable a campos consistentes.',
      'Reduce doble captura entre hojas de RR. HH. y documentos PDF finales.',
    ],
    proofPoints: [
      'CSV y Excel funcionan para revisiones por lote antes de entregar documentos.',
      'Fill By Link permite capturar datos del empleado sin abrir el editor.',
      'Las plantillas guardadas conservan nombres de campos para futuros ciclos de ingreso.',
    ],
    documentExamples: ['formatos de ingreso', 'asignación de activos', 'beneficios', 'políticas internas', 'datos bancarios'],
    sourceRecords: ['ATS', 'HRIS', 'hojas de ingreso', 'listas de activos', 'registros de nómina'],
    fieldExamples: ['nombre_empleado', 'puesto', 'fecha_ingreso', 'sede', 'jefe_directo', 'correo_personal'],
    shortWorkflowLabel: 'onboarding de empleados',
    localContext:
      'RR. HH. suele manejar documentos fijos porque cada paquete debe conservar un formato revisado por la empresa. La fricción está en copiar datos de candidatos, empleados, sedes y beneficios dentro de PDFs que cambian poco pero se generan muchas veces.',
    mappingContext:
      'Separa datos personales, puesto, centro de costo, responsable y beneficios. Esa estructura permite reutilizar el mismo esquema cuando el paquete crece o cuando otro equipo revisa la salida.',
    runtimeContext:
      'Search & Fill es útil para ingresos por lote. Fill By Link encaja cuando el empleado debe confirmar datos personales. API Fill funciona cuando el HRIS ya contiene el registro aprobado.',
    rolloutContext:
      'Valida primero el paquete de ingreso más común. Revisa nombres largos, fechas, sedes, departamentos, casillas de beneficios y campos que solo aplican a ciertos roles.',
    qaChecks: ['Probar empleados con dos apellidos.', 'Validar fechas y centros de costo.', 'Confirmar casillas de beneficios.', 'Revisar documentos de activos y políticas.'],
    boundaryContext:
      'La aprobación de documentos laborales, retención y permisos de acceso deben seguir en el proceso interno de RR. HH. DullyPDF actúa como capa de plantilla y relleno.',
    faqSubject: 'recursos humanos',
    faqSourceLabel: 'datos de empleado, puesto, sede, beneficios y responsable',
    sourceDataAnswer:
      'Usa primero la exportación de HRIS, ATS o la hoja de ingreso que ya contiene datos revisados por RR. HH. Evita empezar con capturas incompletas o nombres de columna ambiguos.',
    outputAnswer:
      'Editable sirve durante la revisión del paquete. Plano es mejor para copias finales que deben verse igual en correo, archivo o sistemas internos.',
  }),
  buildSpanishIndustryPage({
    key: 'es-real-estate-pdf-automation',
    path: '/es/automatizacion-pdf-inmobiliaria',
    navLabel: 'Automatización PDF inmobiliaria',
    heroTitle: 'Automatización de Formularios PDF para Inmobiliarias',
    heroSummary:
      'Rellena solicitudes, contratos operativos, fichas de propiedad, inspecciones y anexos inmobiliarios desde datos estructurados.',
    seoKeywords: [
      'automatización pdf inmobiliaria',
      'formularios pdf inmobiliarios',
      'rellenar contrato inmobiliario pdf',
      'plantilla pdf arrendamiento',
      'formularios de renta pdf',
    ],
    valuePoints: [
      'Mapea datos de propiedad, cliente, unidad, renta, depósito, fechas y responsable.',
      'Reutiliza plantillas por edificio, tipo de operación o flujo de arrendamiento.',
      'Genera PDFs finales con la misma estructura visual que el equipo ya usa.',
    ],
    proofPoints: [
      'Excel y CSV funcionan para carteras de propiedades o listas de prospectos.',
      'Fill By Link captura datos de solicitantes antes de generar el PDF.',
      'API Fill conecta sistemas inmobiliarios con plantillas aprobadas.',
    ],
    documentExamples: ['solicitudes de renta', 'fichas de propiedad', 'anexos', 'inspecciones', 'formatos de entrega'],
    sourceRecords: ['CRM inmobiliario', 'hojas de propiedades', 'portales de renta', 'registros de mantenimiento'],
    fieldExamples: ['nombre_solicitante', 'direccion_propiedad', 'unidad', 'renta_mensual', 'deposito', 'fecha_inicio'],
    shortWorkflowLabel: 'documentación inmobiliaria',
    localContext:
      'Los equipos inmobiliarios trabajan con PDFs que deben mantener una presentación familiar para clientes, propietarios y operaciones. El problema aparece cuando los mismos datos de propiedad, solicitante y condiciones se copian en varias piezas del expediente.',
    mappingContext:
      'Mantén separados los datos de propiedad y los datos de persona. Eso evita que direcciones, unidades, importes y fechas se mezclen cuando el mismo expediente produce varios PDFs.',
    runtimeContext:
      'Search & Fill ayuda cuando el agente revisa cada operación. Fill By Link sirve para solicitudes de datos. API Fill encaja cuando el CRM o sistema de propiedades ya tiene registros confiables.',
    rolloutContext:
      'Empieza con la solicitud o ficha más usada y prueba propiedades con nombres largos, unidades múltiples, importes con decimales y fechas de inicio o entrega.',
    qaChecks: ['Validar direcciones extensas.', 'Confirmar importes y fechas.', 'Probar unidades con letras o torres.', 'Revisar campos opcionales de mantenimiento.'],
    boundaryContext:
      'DullyPDF no reemplaza revisión legal ni aprobación comercial. Solo automatiza la colocación de datos en documentos PDF previamente definidos.',
    faqSubject: 'inmobiliarias',
    faqSourceLabel: 'datos de propiedad, cliente, unidad, renta y fechas',
    sourceDataAnswer:
      'Empieza con el CRM o la hoja de propiedades que ya controla dirección, unidad, solicitante, importes y fechas. Después mapea esos encabezados a campos PDF revisados.',
    outputAnswer:
      'Usa plano para copias finales compartidas con clientes o propietarios. Mantén editable durante limpieza interna de la plantilla.',
  }),
  buildSpanishIndustryPage({
    key: 'es-education-pdf-automation',
    path: '/es/automatizacion-pdf-educacion',
    navLabel: 'Automatización PDF para educación',
    heroTitle: 'Automatización de Formularios PDF para Escuelas y Educación',
    heroSummary:
      'Rellena admisiones, inscripciones, autorizaciones, datos de estudiante y formularios administrativos desde hojas o enlaces.',
    seoKeywords: [
      'formularios pdf escolares',
      'automatización pdf educación',
      'rellenar formularios estudiantes pdf',
      'plantilla pdf admisión escolar',
      'formularios de inscripción pdf',
    ],
    valuePoints: [
      'Organiza datos de estudiante, acudiente, sede, grado, transporte y autorizaciones.',
      'Convierte formularios escolares existentes en plantillas reutilizables.',
      'Reduce captura manual entre hojas administrativas y PDFs finales.',
    ],
    proofPoints: [
      'Search & Fill permite revisar estudiantes desde Excel o CSV.',
      'Fill By Link puede capturar respuestas de familias antes de generar PDFs.',
      'Las plantillas conservan campos para ciclos de admisión futuros.',
    ],
    documentExamples: ['admisiones', 'inscripciones', 'autorizaciones', 'transporte escolar', 'registros administrativos'],
    sourceRecords: ['hojas de admisión', 'SIS', 'formularios web', 'listas de estudiantes'],
    fieldExamples: ['nombre_estudiante', 'grado', 'sede', 'nombre_acudiente', 'telefono_acudiente', 'transporte'],
    shortWorkflowLabel: 'formularios escolares',
    localContext:
      'Las instituciones educativas mantienen formularios PDF por tradición operativa y control administrativo. El reto real es no volver a escribir estudiante, acudiente, sede, grado y autorizaciones en cada documento del ciclo escolar.',
    mappingContext:
      'Separa estudiante, acudiente y datos académicos. Ese esquema permite usar una sola fuente para inscripción, autorizaciones y formularios de servicios sin mezclar responsables.',
    runtimeContext:
      'Search & Fill ayuda cuando administración revisa cada estudiante. Fill By Link funciona cuando familias deben enviar datos. API Fill sirve si el sistema escolar ya tiene el registro final.',
    rolloutContext:
      'Prueba primero un formulario de admisión o inscripción. Valida nombres largos, varios acudientes, grados, sedes, transporte, autorizaciones y campos que deben quedar vacíos.',
    qaChecks: ['Probar estudiantes con nombres largos.', 'Validar datos de acudiente.', 'Confirmar grado y sede.', 'Revisar autorizaciones y transporte.'],
    boundaryContext:
      'Cada institución define permisos de datos, revisión familiar y archivo. DullyPDF solo automatiza la plantilla PDF después de que ese proceso está claro.',
    faqSubject: 'escuelas y educación',
    faqSourceLabel: 'datos de estudiante, acudiente, grado, sede y autorización',
    sourceDataAnswer:
      'Empieza con el SIS, hoja de admisión o exportación que administración ya usa como fuente principal. Evita mapear desde documentos incompletos.',
    outputAnswer:
      'Editable ayuda a corregir plantillas. Plano es mejor para archivos finales o documentos que deben verse igual en cualquier visor.',
  }),
  buildSpanishIndustryPage({
    key: 'es-finance-loan-pdf-automation',
    path: '/es/automatizacion-pdf-finanzas-prestamos',
    navLabel: 'Automatización PDF para préstamos',
    heroTitle: 'Automatización de Formularios PDF para Finanzas y Préstamos',
    heroSummary:
      'Rellena solicitudes, anexos, listas de verificación y expedientes de préstamo desde datos de clientes, operaciones o sistemas internos.',
    seoKeywords: [
      'formularios pdf de préstamos',
      'automatización pdf préstamos',
      'rellenar solicitud de crédito pdf',
      'plantilla pdf financiera',
      'automatizar pdf financiero',
    ],
    valuePoints: [
      'Mapea solicitante, co-solicitante, producto, monto, plazo, sucursal y revisión.',
      'Rellena solicitudes desde Excel, CSV o JSON de sistemas internos.',
      'Genera PDFs revisables sin volver a crear el expediente manualmente.',
    ],
    proofPoints: [
      'Search & Fill permite revisar un registro financiero antes de exportar.',
      'API Fill encaja cuando el sistema de originación ya tiene datos validados.',
      'Las plantillas ayudan a separar campos requeridos, opcionales y de revisión.',
    ],
    documentExamples: ['solicitudes de crédito', 'anexos financieros', 'listas de documentos', 'hojas de aprobación', 'expedientes operativos'],
    sourceRecords: ['CRM financiero', 'LOS', 'hojas de analista', 'sistemas core', 'colas de revisión'],
    fieldExamples: ['nombre_solicitante', 'monto_solicitado', 'plazo', 'producto', 'sucursal', 'analista'],
    shortWorkflowLabel: 'solicitud de préstamo',
    localContext:
      'Los equipos financieros suelen tener documentos PDF fijos para solicitudes, anexos y revisión. El problema operativo es repetir datos de cliente, producto y análisis en formularios que deben conservar su formato.',
    mappingContext:
      'Distingue datos del solicitante, datos de la operación y campos de revisión. Esa separación ayuda a validar montos, plazos y responsables sin mezclar fuentes.',
    runtimeContext:
      'Search & Fill es útil cuando un analista revisa cada expediente. API Fill es mejor cuando el sistema interno ya controla la solicitud y solo necesita generar el PDF.',
    rolloutContext:
      'Empieza con una solicitud frecuente y revisa nombres largos, importes, decimales, fechas, casillas de producto, campos de co-solicitante y estados de documentos.',
    qaChecks: ['Validar importes y decimales.', 'Probar solicitantes y co-solicitantes.', 'Confirmar plazo y producto.', 'Revisar campos de analista y sucursal.'],
    boundaryContext:
      'DullyPDF no decide aprobaciones ni políticas de crédito. La herramienta solo coloca datos revisados dentro de una plantilla PDF controlada.',
    faqSubject: 'finanzas y préstamos',
    faqSourceLabel: 'datos de cliente, producto, monto, plazo y revisión',
    sourceDataAnswer:
      'Empieza con el sistema o exportación que el analista ya considera fuente confiable. Incluye columnas separadas para solicitante, operación, producto, sucursal y revisión.',
    outputAnswer:
      'Usa editable durante revisión interna. Usa plano para copias que se archivan, envían o consumen en sistemas donde no deben editarse campos.',
  }),
  buildSpanishIndustryPage({
    key: 'es-logistics-pdf-automation',
    path: '/es/automatizacion-pdf-logistica',
    navLabel: 'Automatización PDF para logística',
    heroTitle: 'Automatización de Formularios PDF para Logística y Operaciones',
    heroSummary:
      'Rellena guías, órdenes, inventarios, comprobantes y documentos operativos desde datos de envíos, almacenes o ERP.',
    seoKeywords: [
      'automatización pdf logística',
      'formularios pdf logística',
      'rellenar guía pdf automáticamente',
      'plantilla pdf almacén',
      'documentos operativos pdf',
    ],
    valuePoints: [
      'Mapea envío, cliente, SKU, almacén, transportista, referencia y estado.',
      'Rellena documentos operativos desde Excel, CSV o API.',
      'Mantén diseños fijos para equipos que siguen usando PDFs en campo.',
    ],
    proofPoints: [
      'CSV y Excel funcionan para lotes de órdenes o inventario.',
      'API Fill conecta ERP, WMS o TMS con plantillas PDF.',
      'Campos de imagen o código pueden reservar espacio para evidencias operativas cuando aplique.',
    ],
    documentExamples: ['guías de despacho', 'órdenes de salida', 'inventarios', 'comprobantes de entrega', 'formatos de almacén'],
    sourceRecords: ['ERP', 'WMS', 'TMS', 'hojas de ruta', 'exportaciones de inventario'],
    fieldExamples: ['numero_orden', 'cliente', 'sku', 'cantidad', 'almacen', 'transportista'],
    shortWorkflowLabel: 'operación logística',
    localContext:
      'Logística conserva muchos PDFs porque choferes, almacenes, clientes y proveedores todavía intercambian documentos fijos. Automatizar no significa cambiar la operación, sino evitar que una misma orden se copie manualmente en varias hojas.',
    mappingContext:
      'Separa encabezado de orden, líneas de producto, transporte y evidencia. Esa estructura reduce errores cuando un envío o inventario produce más de un PDF.',
    runtimeContext:
      'Search & Fill sirve para lotes revisados por operaciones. API Fill encaja cuando ERP, WMS o TMS ya generan registros limpios y solo falta producir el PDF.',
    rolloutContext:
      'Empieza con el documento de mayor volumen. Revisa cantidades, SKU largos, direcciones, transportistas, referencias, códigos y campos de entrega.',
    qaChecks: ['Probar SKU y descripciones largas.', 'Validar cantidades y unidades.', 'Confirmar direcciones de entrega.', 'Revisar estado y transportista.'],
    boundaryContext:
      'Las reglas de envío, aduana, entrega o almacén deben seguir en los sistemas operativos. DullyPDF rellena documentos después de que los datos ya fueron elegidos.',
    faqSubject: 'logística y operaciones',
    faqSourceLabel: 'datos de orden, envío, inventario, almacén y transportista',
    sourceDataAnswer:
      'Empieza con el ERP, WMS, TMS o exportación de ruta que ya controla el envío. Usa campos separados para orden, SKU, cantidad, almacén, cliente y transportista.',
    outputAnswer:
      'Usa plano para documentos que viajan fuera del sistema o se imprimen. Mantén editable mientras ajustas la plantilla.',
  }),
  buildSpanishIndustryPage({
    key: 'es-accounting-invoice-pdf-automation',
    path: '/es/automatizacion-pdf-contabilidad-facturas',
    navLabel: 'Automatización PDF para facturas',
    heroTitle: 'Automatización de Facturas y Formularios PDF de Contabilidad',
    heroSummary:
      'Rellena facturas, órdenes, reportes, comprobantes y documentos contables desde hojas de cálculo, sistemas internos o API.',
    seoKeywords: [
      'rellenar facturas pdf automáticamente',
      'automatización pdf contabilidad',
      'formularios pdf facturas',
      'plantilla pdf factura',
      'excel a factura pdf',
    ],
    valuePoints: [
      'Mapea cliente, factura, fechas, conceptos, impuestos, totales y aprobadores.',
      'Rellena PDFs desde Excel o CSV cuando contabilidad revisa lotes.',
      'Usa API Fill cuando el ERP ya contiene los importes finales.',
    ],
    proofPoints: [
      'Campos calculados pueden ayudar con subtotales y totales simples cuando la plantilla lo requiere.',
      'Search & Fill permite comparar cada fila antes de exportar.',
      'Las plantillas guardadas reducen trabajo en cierres repetidos.',
    ],
    documentExamples: ['facturas PDF', 'comprobantes', 'órdenes de compra', 'reportes de gastos', 'hojas de aprobación'],
    sourceRecords: ['ERP', 'hojas contables', 'exportaciones de ventas', 'sistemas de facturación', 'listas de gastos'],
    fieldExamples: ['cliente', 'numero_factura', 'fecha', 'subtotal', 'impuesto', 'total'],
    shortWorkflowLabel: 'facturas PDF',
    localContext:
      'Contabilidad suele trabajar con formatos PDF que deben verse iguales para clientes, proveedores o revisión interna. El dolor aparece cuando importes, conceptos y datos fiscales se copian de hojas o ERP a documentos fijos.',
    mappingContext:
      'Distingue encabezado, líneas, impuestos, totales y aprobaciones. Esa separación permite auditar el origen de cada valor y detectar errores antes de exportar.',
    runtimeContext:
      'Search & Fill es útil para lotes pequeños o revisión humana. API Fill encaja cuando el ERP ya calculó importes y solo falta generar la factura o comprobante en PDF.',
    rolloutContext:
      'Empieza con una factura o comprobante de alto volumen. Revisa decimales, símbolos, textos largos, descuentos, impuestos y totales.',
    qaChecks: ['Validar decimales y separadores.', 'Probar conceptos largos.', 'Confirmar impuestos y totales.', 'Revisar fechas y números de factura.'],
    boundaryContext:
      'La política fiscal, aprobación contable y cálculo final deben permanecer en los sistemas de origen. DullyPDF coloca valores en la plantilla PDF aprobada.',
    faqSubject: 'contabilidad y facturas',
    faqSourceLabel: 'datos de cliente, factura, conceptos, impuestos y totales',
    sourceDataAnswer:
      'Empieza con el ERP, sistema de facturación o hoja contable que ya contiene importes aprobados. Evita mapear desde fuentes que todavía cambian después de la revisión.',
    outputAnswer:
      'Plano es mejor para copias finales de factura o comprobante. Editable sirve mientras se ajusta la plantilla.',
  }),
  buildSpanishIndustryPage({
    key: 'es-construction-pdf-automation',
    path: '/es/automatizacion-pdf-construccion',
    navLabel: 'Automatización PDF para construcción',
    heroTitle: 'Automatización de Formularios PDF para Construcción',
    heroSummary:
      'Rellena presupuestos, órdenes de cambio, inspecciones, reportes de obra y formatos de contratista desde datos estructurados.',
    seoKeywords: [
      'formularios pdf construcción',
      'automatización pdf construcción',
      'presupuesto construcción pdf',
      'orden de cambio pdf',
      'plantilla pdf contratista',
    ],
    valuePoints: [
      'Mapea proyecto, cliente, partida, costo, responsable, fecha y estado.',
      'Reutiliza plantillas para presupuestos, cambios e inspecciones.',
      'Genera PDFs consistentes para obra, administración y cliente.',
    ],
    proofPoints: [
      'Excel y CSV funcionan para partidas y listas de revisión.',
      'API Fill conecta sistemas de proyecto con documentos PDF.',
      'La revisión visual ayuda con PDFs densos o formatos de obra escaneados.',
    ],
    documentExamples: ['presupuestos', 'órdenes de cambio', 'inspecciones', 'reportes diarios', 'formatos de contratista'],
    sourceRecords: ['hojas de proyecto', 'ERP de obra', 'listas de materiales', 'sistemas de costos', 'reportes de campo'],
    fieldExamples: ['proyecto', 'cliente', 'partida', 'costo', 'fecha', 'responsable'],
    shortWorkflowLabel: 'documentos de construcción',
    localContext:
      'Construcción combina trabajo de campo, administración y cliente en documentos PDF que se repiten. Automatizar esos formatos reduce recaptura entre hojas de costo, reportes de obra y documentos finales.',
    mappingContext:
      'Separa proyecto, partida, costos, fechas, responsable y estado. Esa estructura evita mezclar presupuesto, cambio e inspección cuando el mismo proyecto genera varios PDFs.',
    runtimeContext:
      'Search & Fill funciona cuando el equipo revisa cada documento. API Fill encaja cuando el sistema de proyecto ya tiene partidas y montos definidos.',
    rolloutContext:
      'Empieza con la orden de cambio o presupuesto más repetido. Revisa descripciones largas, importes, totales, fechas, responsables y estados de aprobación.',
    qaChecks: ['Validar importes y totales.', 'Probar descripciones largas.', 'Confirmar proyecto y responsable.', 'Revisar campos de estado.'],
    boundaryContext:
      'La aprobación contractual, técnica o financiera no debe vivir en DullyPDF. La herramienta genera el PDF después de que los datos y revisiones están definidos.',
    faqSubject: 'construcción',
    faqSourceLabel: 'datos de proyecto, partidas, costos, responsables y fechas',
    sourceDataAnswer:
      'Empieza con la hoja o sistema de obra que contiene partidas y costos revisados. Después mapea esos campos a la plantilla PDF del documento específico.',
    outputAnswer:
      'Usa editable en pruebas internas y plano para documentos que se envían a cliente, obra o archivo.',
  }),
  buildSpanishIndustryPage({
    key: 'es-field-service-pdf-automation',
    path: '/es/automatizacion-pdf-servicios-campo',
    navLabel: 'Automatización PDF para servicios de campo',
    heroTitle: 'Automatización de Formularios PDF para Servicios de Campo',
    heroSummary:
      'Rellena órdenes de trabajo, inspecciones, reportes de visita y documentos de servicio desde datos de cliente, activo o técnico.',
    seoKeywords: [
      'formularios pdf órdenes de trabajo',
      'automatización pdf servicio de campo',
      'orden de trabajo pdf rellenable',
      'plantilla pdf inspección',
      'reporte de servicio pdf',
    ],
    valuePoints: [
      'Mapea cliente, activo, ubicación, técnico, fecha, trabajo y resultado.',
      'Rellena órdenes desde hojas, sistemas internos o enlaces de captura.',
      'Genera documentos consistentes para revisión, archivo o entrega al cliente.',
    ],
    proofPoints: [
      'Fill By Link puede capturar datos de campo antes de generar el PDF.',
      'Search & Fill sirve para revisar órdenes desde una lista.',
      'API Fill encaja con sistemas de tickets o activos.',
    ],
    documentExamples: ['órdenes de trabajo', 'inspecciones', 'reportes de servicio', 'checklists', 'formatos de activos'],
    sourceRecords: ['sistemas de tickets', 'CMMS', 'listas de activos', 'hojas de técnicos', 'CRM'],
    fieldExamples: ['cliente', 'activo', 'ubicacion', 'tecnico', 'fecha_servicio', 'resultado'],
    shortWorkflowLabel: 'servicio de campo',
    localContext:
      'Los equipos de campo suelen terminar con PDFs porque clientes, supervisores y archivo necesitan una copia clara del trabajo realizado. El problema aparece al copiar datos desde tickets, activos y notas de técnico hacia documentos repetidos.',
    mappingContext:
      'Separa cliente, ubicación, activo, técnico y resultado. Esa estructura evita que información de servicio se pierda dentro de notas genéricas.',
    runtimeContext:
      'Fill By Link puede capturar datos de una visita. Search & Fill funciona cuando coordinación revisa órdenes. API Fill es útil cuando el sistema de tickets ya controla el trabajo.',
    rolloutContext:
      'Empieza con una orden de trabajo frecuente. Prueba ubicaciones largas, activos, técnicos, fechas, casillas de revisión y campos de resultado.',
    qaChecks: ['Validar ubicaciones largas.', 'Confirmar activo y técnico.', 'Probar casillas de inspección.', 'Revisar resultado y observaciones.'],
    boundaryContext:
      'La aprobación técnica o de garantía debe quedar en el proceso del equipo. DullyPDF solo produce el documento final a partir de datos seleccionados.',
    faqSubject: 'servicios de campo',
    faqSourceLabel: 'datos de cliente, activo, ubicación, técnico y trabajo realizado',
    sourceDataAnswer:
      'Empieza con el sistema de tickets, CMMS o lista de activos que el equipo usa para programar visitas. Mapea campos separados para cliente, activo, ubicación y resultado.',
    outputAnswer:
      'Plano es mejor para entrega al cliente o archivo. Editable sirve para revisión interna antes de cerrar la plantilla.',
  }),
  buildSpanishIndustryPage({
    key: 'es-procurement-pdf-automation',
    path: '/es/automatizacion-pdf-compras-proveedores',
    navLabel: 'Automatización PDF para compras',
    heroTitle: 'Automatización de Formularios PDF para Compras y Proveedores',
    heroSummary:
      'Rellena alta de proveedores, órdenes de compra, solicitudes internas y documentos de aprobación desde datos de compras o ERP.',
    seoKeywords: [
      'formularios pdf proveedores',
      'automatización pdf compras',
      'orden de compra pdf',
      'alta proveedor pdf',
      'plantilla pdf compras',
    ],
    valuePoints: [
      'Mapea proveedor, producto, orden, condiciones, aprobador, centro de costo y total.',
      'Rellena documentos de compras desde Excel, CSV o API.',
      'Mantén plantillas consistentes para proveedores y revisión interna.',
    ],
    proofPoints: [
      'Search & Fill permite revisar proveedores o compras por fila.',
      'API Fill conecta ERP o sistemas de procurement con PDF.',
      'Las plantillas guardadas ayudan a estandarizar altas y órdenes recurrentes.',
    ],
    documentExamples: ['altas de proveedor', 'órdenes de compra', 'solicitudes internas', 'cambios de proveedor', 'aprobaciones de compra'],
    sourceRecords: ['ERP', 'vendor master', 'hojas de compras', 'sistemas de procurement', 'listas de centros de costo'],
    fieldExamples: ['proveedor', 'numero_oc', 'centro_costo', 'producto', 'total', 'aprobador'],
    shortWorkflowLabel: 'compras y proveedores',
    localContext:
      'Compras maneja PDFs repetidos para altas, órdenes, cambios y aprobaciones. La automatización ayuda cuando el registro de proveedor o compra ya existe y solo debe expresarse en documentos fijos.',
    mappingContext:
      'Separa proveedor, compra, condiciones, centro de costo y aprobaciones. Ese esquema reduce errores cuando un proveedor aparece en varios documentos.',
    runtimeContext:
      'Search & Fill ayuda a revisar filas de compras. API Fill funciona cuando ERP o procurement ya controlan proveedor, importes y aprobaciones.',
    rolloutContext:
      'Empieza con alta de proveedor u orden de compra. Revisa nombres legales largos, condiciones, centros de costo, impuestos, totales y responsables.',
    qaChecks: ['Probar nombres de proveedor largos.', 'Validar total y condiciones.', 'Confirmar centro de costo.', 'Revisar aprobador y estado.'],
    boundaryContext:
      'La aprobación de proveedor, compras y pagos debe seguir en los sistemas internos. DullyPDF usa los datos aprobados para generar el PDF.',
    faqSubject: 'compras y proveedores',
    faqSourceLabel: 'datos de proveedor, orden, centro de costo, importes y aprobación',
    sourceDataAnswer:
      'Empieza con ERP, vendor master o sistema de compras que ya contiene proveedores y órdenes aprobadas. Después mapea esos valores a la plantilla PDF.',
    outputAnswer:
      'Plano es adecuado para copias finales. Editable sirve mientras el equipo revisa la plantilla o hace pruebas de mapeo.',
  }),
];

export const SPANISH_WORKFLOW_INTENT_PAGES = [
  buildSpanishWorkflowPage({
    key: 'es-create-fillable-pdf-form',
    path: '/es/crear-formulario-pdf-rellenable',
    navLabel: 'Crear formulario PDF rellenable',
    heroTitle: 'Crear un Formulario PDF Rellenable con IA',
    heroSummary:
      'Sube un PDF existente, detecta campos con IA, revisa la geometría y guarda una plantilla rellenable para reutilizarla con datos reales.',
    seoKeywords: [
      'crear formulario pdf rellenable',
      'hacer pdf rellenable',
      'crear pdf rellenable con ia',
      'convertir pdf en formulario rellenable',
      'formulario pdf editable',
    ],
    valuePoints: [
      'Convierte PDFs fijos en plantillas con campos revisables.',
      'Ajusta nombres, tipos y posiciones antes de guardar.',
      'Reutiliza la plantilla con Excel, CSV, Fill By Link o API.',
    ],
    proofPoints: [
      'La detección propone campos sobre PDFs nativos o escaneados.',
      'El editor permite revisar la salida antes de usarla en producción.',
      'Las plantillas guardadas conservan campos y PDF base.',
    ],
    shortWorkflowLabel: 'crear PDF rellenable',
    workflowOutcome: 'la creación de formularios PDF rellenables',
    setupContext:
      'La mayoría de los equipos no quieren rediseñar un documento desde cero. Ya tienen un PDF aprobado y necesitan convertirlo en una plantilla que pueda recibir datos sin perder el formato visual.',
    setupSteps: ['Subir el PDF existente.', 'Detectar campos con IA.', 'Corregir nombres, tipos y posiciones.', 'Guardar la plantilla reutilizable.'],
    dataContext:
      'Después de revisar los campos, prepara una fuente con nombres claros. Esa fuente puede ser una hoja de cálculo, un JSON de prueba o respuestas capturadas por enlace.',
    fieldExamples: ['nombre_cliente', 'fecha', 'direccion', 'correo', 'importe'],
    runtimeContext:
      'Este flujo encaja cuando el documento se repite y cada salida cambia solo por datos. Si el PDF cambia de diseño cada vez, conviene estabilizar primero el formato.',
    qaContext:
      'Prueba el formulario con un registro real. Revisa campos largos, acentos, fechas, casillas y espacios pequeños antes de compartirlo con el equipo.',
    qaChecks: ['Verificar todos los campos requeridos.', 'Probar texto largo.', 'Confirmar casillas y fechas.', 'Abrir una salida plana.'],
    productContext:
      'Esta ruta es la base de casi todos los flujos de DullyPDF en español. Una vez que el PDF es rellenable, puedes mapear datos, capturar respuestas por enlace o generar salidas por API.',
    faqPurpose:
      'Sirve para convertir un PDF existente en una plantilla con campos editables y reutilizables, sin reconstruir el documento desde cero.',
    faqDataSource:
      'Sí. Después de guardar la plantilla puedes rellenarla desde Excel, CSV, JSON, respuestas por enlace o API.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-fill-pdf-from-excel',
    path: '/es/rellenar-pdf-desde-excel',
    navLabel: 'Rellenar PDF desde Excel',
    heroTitle: 'Rellenar un PDF desde Excel sin Copiar y Pegar',
    heroSummary:
      'Mapea columnas de Excel a campos PDF revisados y genera documentos finales desde filas reales de clientes, empleados, pacientes o pedidos.',
    seoKeywords: [
      'rellenar pdf desde excel',
      'excel a pdf rellenable',
      'llenar pdf con datos de excel',
      'automatizar pdf desde excel',
      'rellenar formulario pdf con excel',
    ],
    valuePoints: [
      'Usa encabezados de Excel como fuente de mapeo.',
      'Busca y revisa filas antes de generar cada PDF.',
      'Evita volver a escribir la misma información en formularios repetidos.',
    ],
    proofPoints: [
      'Search & Fill acepta archivos XLSX para revisión en navegador.',
      'El mapeo guarda la relación entre columnas y campos PDF.',
      'Las salidas pueden ser editables durante prueba o planas para uso final.',
    ],
    shortWorkflowLabel: 'Excel a PDF',
    workflowOutcome: 'el relleno de PDFs desde Excel',
    setupContext:
      'Excel sigue siendo la fuente operativa de muchos equipos. DullyPDF permite usar esa hoja como fuente de datos sin convertirla en un formulario nuevo ni cambiar el PDF original.',
    setupSteps: ['Crear o abrir una plantilla PDF.', 'Subir el Excel de ejemplo.', 'Mapear columnas a campos.', 'Probar una fila antes del lote.'],
    dataContext:
      'Limpia encabezados y elimina columnas ambiguas antes de mapear. Una hoja con nombres consistentes reduce errores al generar PDFs desde distintas filas.',
    fieldExamples: ['cliente', 'numero_cuenta', 'fecha_inicio', 'monto', 'responsable'],
    runtimeContext:
      'Este flujo funciona bien para listas revisadas por una persona: altas, expedientes, facturas, admisiones, solicitudes o cualquier documento que se genera desde filas.',
    qaContext:
      'Prueba filas con datos largos, vacíos y caracteres especiales. Revisa que las columnas correctas llenen los campos correctos y que las casillas no dependan de valores ambiguos.',
    qaChecks: ['Validar encabezados de Excel.', 'Probar filas con valores vacíos.', 'Confirmar fechas e importes.', 'Revisar una salida plana.'],
    productContext:
      'Excel a PDF se apoya en la misma plantilla guardada que usan CSV, enlaces y API. El valor aparece cuando el mapeo se conserva para próximos archivos.',
    faqPurpose:
      'Sirve para generar PDFs finales usando filas de Excel como fuente de datos, sin copiar valores manualmente campo por campo.',
    faqDataSource:
      'Sí. Excel es una fuente directa para Search & Fill; también puedes usar CSV o JSON si el flujo cambia de herramienta.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-fill-pdf-from-csv',
    path: '/es/rellenar-pdf-desde-csv',
    navLabel: 'Rellenar PDF desde CSV',
    heroTitle: 'Rellenar Formularios PDF desde CSV',
    heroSummary:
      'Carga un CSV, mapea encabezados a campos PDF y rellena documentos repetidos desde registros estructurados.',
    seoKeywords: [
      'rellenar pdf desde csv',
      'csv a pdf rellenable',
      'llenar pdf con csv',
      'automatizar formulario pdf csv',
      'generar pdf desde csv',
    ],
    valuePoints: [
      'Usa CSV para flujos simples, exportaciones y datos de sistemas.',
      'Mapea columnas una vez y reutiliza la plantilla.',
      'Revisa registros antes de generar PDFs finales.',
    ],
    proofPoints: [
      'CSV funciona en Search & Fill junto con Excel, JSON y TXT.',
      'Los encabezados mapeados quedan ligados a nombres de campos PDF.',
      'El flujo permite probar registros antes de automatizar volumen.',
    ],
    shortWorkflowLabel: 'CSV a PDF',
    workflowOutcome: 'el relleno de formularios PDF desde CSV',
    setupContext:
      'CSV es una fuente práctica cuando los datos vienen de CRM, ERP, formularios web o reportes exportados. La clave es que el PDF ya tenga campos revisados antes de mapear.',
    setupSteps: ['Revisar campos del PDF.', 'Subir un CSV representativo.', 'Mapear encabezados.', 'Probar registros reales.'],
    dataContext:
      'Un CSV limpio debe tener encabezados estables y valores normalizados. Evita columnas que mezclen varios datos si el PDF necesita colocarlos en regiones distintas.',
    fieldExamples: ['id_registro', 'nombre', 'correo', 'estado', 'fecha'],
    runtimeContext:
      'Este flujo encaja con exportaciones periódicas y lotes de documentos. También es una buena etapa previa antes de pasar a API Fill.',
    qaContext:
      'Revisa separadores, codificación, acentos, fechas e importes. Un CSV mal exportado puede llenar campos correctos con valores incompletos.',
    qaChecks: ['Confirmar encabezados únicos.', 'Probar acentos y caracteres especiales.', 'Validar fechas.', 'Revisar valores vacíos.'],
    productContext:
      'CSV a PDF comparte la misma lógica de plantilla y mapeo que Excel y API. Si el flujo madura, puedes conservar el esquema y cambiar la fuente de datos.',
    faqPurpose:
      'Sirve para generar documentos PDF desde registros CSV, especialmente cuando la información viene de exportaciones o sistemas internos.',
    faqDataSource:
      'Sí. CSV funciona directamente en Search & Fill; también puedes migrar el mismo mapeo hacia Excel o API cuando el proceso lo requiera.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-fill-pdf-by-link',
    path: '/es/formulario-pdf-con-link',
    navLabel: 'Formulario PDF con link',
    heroTitle: 'Crear un Link para Rellenar un PDF',
    heroSummary:
      'Publica una experiencia web para capturar respuestas y generar el PDF final desde una plantilla revisada.',
    seoKeywords: [
      'formulario pdf con link',
      'rellenar pdf por enlace',
      'link para llenar formulario pdf',
      'capturar respuestas para pdf',
      'formulario web a pdf',
    ],
    valuePoints: [
      'Permite que otra persona complete datos sin abrir el editor PDF.',
      'Genera PDFs desde respuestas controladas.',
      'Mantiene el documento final en el formato PDF existente.',
    ],
    proofPoints: [
      'Fill By Link usa la plantilla guardada como destino.',
      'Las respuestas pueden revisarse antes de generar salidas finales.',
      'El flujo evita enviar PDFs editables para captura de datos.',
    ],
    shortWorkflowLabel: 'PDF por enlace',
    workflowOutcome: 'la captura de respuestas por enlace',
    setupContext:
      'Cuando el dato debe venir de otra persona, enviar un PDF editable suele crear versiones difíciles de controlar. Fill By Link cambia la captura a un formulario web y mantiene el PDF como salida final.',
    setupSteps: ['Crear la plantilla PDF.', 'Elegir campos para captura.', 'Publicar el enlace.', 'Revisar respuestas y generar PDF.'],
    dataContext:
      'Define preguntas claras y campos obligatorios solo cuando realmente sean necesarios. El enlace debe capturar datos que luego tengan un destino concreto dentro del PDF.',
    fieldExamples: ['nombre', 'telefono', 'direccion', 'fecha_solicitud', 'comentarios'],
    runtimeContext:
      'Este flujo encaja con admisiones, solicitudes, actualizaciones de datos, altas de proveedor y cualquier documento donde el usuario externo no debe tocar la plantilla.',
    qaContext:
      'Prueba el enlace en móvil y escritorio. Confirma que las respuestas largas no rompan el PDF y que los campos opcionales se comporten bien cuando quedan vacíos.',
    qaChecks: ['Probar respuesta desde móvil.', 'Confirmar campos obligatorios.', 'Revisar texto largo.', 'Generar PDF de prueba.'],
    productContext:
      'Fill By Link se mantiene enfocado en captura de respuestas y generación de PDF. Las páginas en español no posicionan este flujo como una solución de aprobación legal.',
    faqPurpose:
      'Sirve para capturar datos mediante un enlace web y generar un PDF final con esos datos colocados en la plantilla.',
    faqDataSource:
      'Sí. El enlace captura respuestas, y la misma plantilla puede rellenarse también desde Excel, CSV o API si el proceso cambia.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-pdf-fill-api',
    path: '/es/api-rellenar-pdf',
    navLabel: 'API para rellenar PDF',
    heroTitle: 'API para Rellenar Formularios PDF',
    heroSummary:
      'Conecta una plantilla PDF mapeada con JSON de tus sistemas para generar documentos finales desde una API.',
    seoKeywords: [
      'api para rellenar pdf',
      'rellenar pdf con api',
      'json a pdf api',
      'api formularios pdf',
      'generar pdf desde json',
    ],
    valuePoints: [
      'Usa JSON para llenar plantillas PDF guardadas.',
      'Mantén un contrato estable entre sistema interno y campos PDF.',
      'Genera salidas sin abrir el editor para cada documento.',
    ],
    proofPoints: [
      'API Fill requiere una plantilla revisada y mapeada.',
      'Los nombres de campo claros reducen errores de integración.',
      'Las pruebas con JSON representativo validan el contrato antes de producción.',
    ],
    shortWorkflowLabel: 'API PDF',
    workflowOutcome: 'la generación de PDFs desde API',
    setupContext:
      'La API tiene sentido después de que la plantilla ya fue revisada. Si el PDF todavía cambia o los campos no están bien nombrados, la integración será frágil.',
    setupSteps: ['Crear plantilla PDF.', 'Mapear campos a nombres estables.', 'Probar JSON representativo.', 'Conectar el sistema interno.'],
    dataContext:
      'Diseña el JSON como un contrato, no como una copia accidental de una pantalla. Cada clave debe tener un destino claro en el PDF.',
    fieldExamples: ['customer.name', 'order.number', 'total.amount', 'approval.status', 'submitted_at'],
    runtimeContext:
      'API Fill encaja cuando CRM, ERP, portal o backend ya tienen datos limpios y necesitan producir documentos finales sin intervención manual.',
    qaContext:
      'Prueba payloads completos, payloads con campos vacíos y valores largos. Registra errores de mapeo antes de liberar la integración a producción.',
    qaChecks: ['Validar JSON completo.', 'Probar campos faltantes.', 'Confirmar tipos de fecha e importe.', 'Abrir PDF generado.'],
    productContext:
      'La API usa la misma lógica de plantilla que Search & Fill. Eso permite probar manualmente antes de automatizar desde el sistema interno.',
    faqPurpose:
      'Sirve para generar PDFs desde JSON enviado por un sistema interno, siempre que exista una plantilla guardada y mapeada.',
    faqDataSource:
      'Sí. La API usa JSON, mientras que la misma plantilla puede probarse con Excel o CSV antes de conectarla a producción.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-ai-pdf-field-detection',
    path: '/es/detectar-campos-pdf-ia',
    navLabel: 'Detectar campos PDF con IA',
    heroTitle: 'Detectar Campos de un PDF con IA',
    heroSummary:
      'Usa detección automática para encontrar campos candidatos en un PDF y después revisa posición, tipo y nombre antes de guardar.',
    seoKeywords: [
      'detectar campos pdf con ia',
      'detección de campos pdf',
      'campos de formulario pdf ia',
      'reconocer campos pdf',
      'pdf a formulario con ia',
    ],
    valuePoints: [
      'Reduce el dibujo manual de campos sobre PDFs existentes.',
      'Revisa candidatos antes de confiar en la plantilla.',
      'Combina detección con edición visual para corregir resultados.',
    ],
    proofPoints: [
      'La detección trabaja sobre PDFs nativos y escaneados con distinta calidad.',
      'El editor permite mover, redimensionar y ajustar tipos de campo.',
      'Las plantillas guardadas preservan la revisión para futuros usos.',
    ],
    shortWorkflowLabel: 'detección de campos',
    workflowOutcome: 'la detección y limpieza de campos PDF',
    setupContext:
      'La IA acelera el primer borrador de campos, pero no reemplaza la revisión. El operador debe confirmar que cada región detectada coincide con el formulario real.',
    setupSteps: ['Subir el PDF.', 'Ejecutar detección.', 'Revisar candidatos.', 'Ajustar geometría y tipos.'],
    dataContext:
      'Después de detectar campos, usa nombres que describan el dato final. Esa nomenclatura es la base para mapear Excel, CSV, respuestas o API.',
    fieldExamples: ['nombre', 'fecha', 'direccion', 'telefono', 'opcion_seleccionada'],
    runtimeContext:
      'Este flujo es ideal para formularios existentes con líneas, cajas o espacios claros. PDFs ruidosos o muy densos pueden necesitar más corrección manual.',
    qaContext:
      'Revisa primero campos de baja confianza, cajas apretadas, grupos de casillas y campos que parecen duplicados. Después prueba un registro real.',
    qaChecks: ['Revisar campos duplicados.', 'Confirmar casillas.', 'Ajustar campos desplazados.', 'Probar un relleno real.'],
    productContext:
      'La detección es el inicio del flujo. El valor aparece cuando los campos detectados se convierten en una plantilla mapeada y reutilizable.',
    faqPurpose:
      'Sirve para crear un borrador de campos sobre un PDF existente y reducir el trabajo manual de preparación de la plantilla.',
    faqDataSource:
      'Sí. Después de detectar y revisar campos, puedes usar la plantilla con Excel, CSV, enlaces o API.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-ai-pdf-field-renaming',
    path: '/es/renombrar-campos-pdf-ia',
    navLabel: 'Renombrar campos PDF con IA',
    heroTitle: 'Renombrar Campos PDF con IA para Mapear Datos Mejor',
    heroSummary:
      'Convierte nombres genéricos de campos en nombres legibles para que el mapeo desde Excel, CSV o API sea más confiable.',
    seoKeywords: [
      'renombrar campos pdf',
      'nombres de campos pdf con ia',
      'mapear campos pdf',
      'campos pdf para excel',
      'organizar campos formulario pdf',
    ],
    valuePoints: [
      'Cambia nombres genéricos por claves entendibles.',
      'Mejora el mapeo con hojas y JSON.',
      'Reduce errores cuando varias personas reutilizan la plantilla.',
    ],
    proofPoints: [
      'Los nombres claros ayudan a Search & Fill y API Fill.',
      'La revisión humana confirma que cada sugerencia es correcta.',
      'Las plantillas guardadas conservan la nomenclatura limpia.',
    ],
    shortWorkflowLabel: 'renombrado de campos',
    workflowOutcome: 'el mapeo claro de campos PDF',
    setupContext:
      'Muchos PDFs tienen campos llamados Text1, field_3 o valores similares. Esos nombres funcionan técnicamente, pero son débiles para operaciones repetidas.',
    setupSteps: ['Detectar o importar campos.', 'Revisar etiquetas visibles.', 'Generar nombres sugeridos.', 'Confirmar nombres finales.'],
    dataContext:
      'Los nombres deben acercarse a los encabezados de datos que usará el equipo. Eso facilita mapear columnas y revisar errores.',
    fieldExamples: ['cliente_nombre', 'cliente_correo', 'fecha_inicio', 'monto_total', 'estado_revision'],
    runtimeContext:
      'Este flujo encaja antes de conectar Excel, CSV o API. Si los nombres quedan claros, el resto del proceso es más fácil de mantener.',
    qaContext:
      'Busca nombres duplicados, campos demasiado genéricos y casillas sin contexto. Un nombre claro debe decir qué dato espera y dónde se usa.',
    qaChecks: ['Eliminar nombres duplicados.', 'Confirmar contexto de casillas.', 'Alinear nombres con columnas.', 'Guardar plantilla limpia.'],
    productContext:
      'Renombrar campos es una inversión pequeña que mejora todas las rutas posteriores: Search & Fill, Fill By Link, API y plantillas por industria.',
    faqPurpose:
      'Sirve para convertir campos con nombres técnicos o confusos en claves útiles para mapeo, revisión y automatización.',
    faqDataSource:
      'Sí. Los nuevos nombres ayudan a conectar Excel, CSV, JSON y respuestas por enlace con menos ambigüedad.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-map-data-to-pdf',
    path: '/es/mapear-datos-a-pdf',
    navLabel: 'Mapear datos a PDF',
    heroTitle: 'Mapear Datos a Campos PDF',
    heroSummary:
      'Alinea columnas, encabezados o claves JSON con campos PDF para rellenar documentos repetidos de forma consistente.',
    seoKeywords: [
      'mapear datos a pdf',
      'mapear campos pdf',
      'asignar columnas a pdf',
      'json a campos pdf',
      'mapeo formulario pdf',
    ],
    valuePoints: [
      'Conecta fuentes de datos con campos PDF revisados.',
      'Guarda el mapeo para próximos archivos o integraciones.',
      'Evita depender de coincidencias manuales cada vez.',
    ],
    proofPoints: [
      'El mapeo funciona con Excel, CSV, JSON y TXT de esquema.',
      'Los campos renombrados mejoran la precisión del mapeo.',
      'Una plantilla validada puede usarse en varios flujos de ejecución.',
    ],
    shortWorkflowLabel: 'mapeo de datos',
    workflowOutcome: 'la conexión entre datos estructurados y PDF',
    setupContext:
      'Mapear datos significa decidir qué columna o clave debe llenar cada campo del PDF. Esa decisión debe quedar guardada para que el próximo documento no empiece desde cero.',
    setupSteps: ['Limpiar nombres de campos.', 'Subir fuente de ejemplo.', 'Revisar sugerencias de mapeo.', 'Guardar y probar.'],
    dataContext:
      'La fuente debe expresar un dato por columna o clave. Cuando una columna mezcla varios conceptos, el PDF termina dependiendo de correcciones manuales.',
    fieldExamples: ['nombre_cliente', 'id_cliente', 'fecha_documento', 'monto', 'estado'],
    runtimeContext:
      'Este flujo es central para cualquier operación que llena PDFs desde datos existentes. Es útil antes de Excel, CSV, API o paquetes de documentos.',
    qaContext:
      'Compara una fila contra el PDF final. Revisa valores que se parecen pero pertenecen a campos distintos, como dirección de cliente y dirección de envío.',
    qaChecks: ['Confirmar cada campo requerido.', 'Detectar columnas ambiguas.', 'Probar fila real.', 'Revisar PDF generado.'],
    productContext:
      'El mapeo es la capa que convierte una plantilla visual en una herramienta operativa. Sin mapeo estable, cada ejecución vuelve a ser manual.',
    faqPurpose:
      'Sirve para conectar datos estructurados con campos PDF y guardar esa relación para repetir el relleno.',
    faqDataSource:
      'Sí. Puedes mapear desde Excel, CSV, JSON o un esquema TXT y reutilizar el resultado en distintos modos de relleno.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-reusable-pdf-template',
    path: '/es/plantilla-pdf-reutilizable',
    navLabel: 'Plantilla PDF reutilizable',
    heroTitle: 'Guardar una Plantilla PDF Reutilizable',
    heroSummary:
      'Convierte la preparación de un PDF en una plantilla que se puede abrir, revisar y rellenar muchas veces sin repetir el setup.',
    seoKeywords: [
      'plantilla pdf reutilizable',
      'guardar formulario pdf rellenable',
      'reutilizar formulario pdf',
      'plantilla pdf para rellenar',
      'pdf rellenable reutilizable',
    ],
    valuePoints: [
      'Preserva el PDF base y los campos revisados.',
      'Reutiliza nombres y mapeos en futuros registros.',
      'Evita rehacer la detección y limpieza en cada ciclo.',
    ],
    proofPoints: [
      'Las plantillas guardadas pueden reabrirse para nuevos datos.',
      'El mapeo estable ayuda a cambiar de Excel a API sin rehacer todo.',
      'Las salidas finales se generan desde la misma base revisada.',
    ],
    shortWorkflowLabel: 'plantilla reutilizable',
    workflowOutcome: 'la reutilización de formularios PDF',
    setupContext:
      'Una conversión de una sola vez puede ser suficiente para un documento aislado. En operaciones reales, el valor está en guardar el trabajo para repetirlo con nuevos registros.',
    setupSteps: ['Detectar campos.', 'Limpiar la plantilla.', 'Renombrar y mapear.', 'Guardar para reutilizar.'],
    dataContext:
      'Guarda la plantilla solo después de probar datos reales. Los nombres de campo y mapeos se vuelven el contrato que otros usuarios reutilizarán.',
    fieldExamples: ['registro_id', 'nombre', 'fecha', 'estado', 'responsable'],
    runtimeContext:
      'Este flujo encaja cuando el mismo documento aparece semanal o mensualmente, o cuando varios miembros del equipo deben producir la misma salida.',
    qaContext:
      'Antes de guardar, limpia campos duplicados, confirma tipos, prueba una salida plana y verifica que otra persona pueda entender los nombres.',
    qaChecks: ['Confirmar campos requeridos.', 'Eliminar duplicados.', 'Probar salida editable y plana.', 'Reabrir plantilla guardada.'],
    productContext:
      'Las plantillas reutilizables son el centro de DullyPDF. Todos los flujos en español se apoyan en preparar bien una plantilla antes de escalar.',
    faqPurpose:
      'Sirve para conservar un PDF preparado y volver a rellenarlo con nuevos datos sin repetir detección, limpieza y mapeo.',
    faqDataSource:
      'Sí. Una plantilla reutilizable puede rellenarse desde Excel, CSV, respuestas por enlace o API según el proceso.',
  }),
  buildSpanishWorkflowPage({
    key: 'es-pdf-packet-workflow',
    path: '/es/rellenar-paquetes-pdf',
    navLabel: 'Rellenar paquetes PDF',
    heroTitle: 'Rellenar Paquetes de PDFs desde un Solo Registro',
    heroSummary:
      'Usa una fuente de datos para producir varios PDFs relacionados, como paquetes de admisión, onboarding, compras o operaciones.',
    seoKeywords: [
      'rellenar paquetes pdf',
      'llenar varios pdf con una fila',
      'paquete pdf desde excel',
      'automatizar paquete de formularios pdf',
      'varios formularios pdf desde datos',
    ],
    valuePoints: [
      'Reutiliza un registro para varios documentos del mismo expediente.',
      'Mantén nombres de campos consistentes entre plantillas.',
      'Reduce captura repetida cuando un flujo genera varios PDFs.',
    ],
    proofPoints: [
      'Los paquetes se apoyan en plantillas revisadas por documento.',
      'El mismo esquema puede alimentar admisiones, RR. HH., compras o finanzas.',
      'Search & Fill permite validar una fila antes de generar el conjunto.',
    ],
    shortWorkflowLabel: 'paquetes PDF',
    workflowOutcome: 'la generación de varios PDFs relacionados',
    setupContext:
      'Un paquete PDF no es un archivo grande sin estructura. Es un conjunto de documentos que comparten datos del mismo registro y necesitan mapeos consistentes.',
    setupSteps: ['Preparar cada plantilla.', 'Usar nombres comunes.', 'Mapear un registro compartido.', 'Probar el paquete completo.'],
    dataContext:
      'El registro debe cubrir datos comunes y campos específicos de cada documento. Los nombres repetidos deben significar lo mismo en todas las plantillas.',
    fieldExamples: ['persona_nombre', 'persona_id', 'direccion', 'fecha_expediente', 'estado_revision'],
    runtimeContext:
      'Este flujo encaja con admisiones, onboarding, préstamos, compras, expedientes de cliente y operaciones donde una fila produce varios PDFs.',
    qaContext:
      'Revisa cada PDF por separado y después el paquete completo. Un error de nombre compartido puede propagarse a varios documentos.',
    qaChecks: ['Confirmar nombres comunes.', 'Probar una fila completa.', 'Revisar cada salida.', 'Validar documentos opcionales.'],
    productContext:
      'Los paquetes son una extensión natural de las plantillas reutilizables. Primero estabiliza cada documento; después conecta el conjunto a la misma fuente.',
    faqPurpose:
      'Sirve para generar varios PDFs relacionados desde una sola fila o registro, evitando repetir datos en cada documento.',
    faqDataSource:
      'Sí. Puedes probar paquetes desde Excel o CSV y después conectar API cuando el registro compartido ya sea estable.',
  }),
];

export const SPANISH_INTENT_PAGES = [
  ...SPANISH_WORKFLOW_INTENT_PAGES,
  ...SPANISH_INDUSTRY_INTENT_PAGES,
];
