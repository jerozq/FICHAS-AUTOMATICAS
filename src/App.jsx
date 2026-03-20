import React, { useState, useEffect } from 'react';

// Custom Hook to manage local storage persistence
function useStickyState(defaultValue, key) {
  const [value, setValue] = useState(() => {
    const stickyValue = window.localStorage.getItem(key);
    return stickyValue !== null
      ? JSON.parse(stickyValue)
      : defaultValue;
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

const DEFAULT_FORM_DATA = {
  primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '',
  tipo_documento: 'cc', cedula: '', expedida_en: '', fecha_expedicion: '',
  fecha_nacimiento: '', nacionalidad: '', sexo: 'masculino',

  direccion: '', barrio: '', vereda: '', departamento: '',
  municipio: '', correo: '', celular: '', telefono: '',

  nivel_educativo: '', estado_civil: 'soltero', n_hijos: '', estrato: '',
  situacion_laboral: 'dependiente', vivienda: 'propia', ingreso_mensual: '', cargo: '',

  rus: '', ruc: '', lugar_recepcion: '', fecha_recepcion: '',
  conducta_punible: '', numero_proceso: '', fecha_hora_captura: '',
  fiscal: '', juez: '', privado_libertad: false, centro_reclusion: '',
  resumen_hechos: ''
};

const OBLIGATORIOS = [
  "rus", "ruc", "lugar_recepcion", "fecha_recepcion",
  "primer_apellido", "primer_nombre", "segundo_apellido",
  "cedula", "expedida_en", "nacionalidad", "direccion",
  "departamento", "municipio", "celular", "fecha_nacimiento",
  "nivel_educativo", "n_hijos", "estrato", "conducta_punible",
  "numero_proceso", "fecha_hora_captura", "fiscal", "juez",
  "resumen_hechos"
];

function App() {
  const rawApiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
  const API_URL = rawApiUrl.match(/^https?:\/\//) ? rawApiUrl : `https://${rawApiUrl}`;
  console.log(API_URL);
  const [isLoading, setIsLoading] = useState(false);
  // Persist form data in localStorage under 'fichasFormData'
  const [formData, setFormData] = useStickyState(DEFAULT_FORM_DATA, 'fichasFormData');
  const [missingFields, setMissingFields] = useState([]);

  // Track active section for the sidebar spy (optional UX plus)
  const [activeSection, setActiveSection] = useState('identificacion');

  // Simple scroll spy logic
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['identificacion', 'contacto', 'proceso'];
      let currentIdx = 0;

      for (let s of sections) {
        const el = document.getElementById(s);
        if (el && window.scrollY >= (el.offsetTop - 200)) {
          currentIdx = sections.indexOf(s);
        }
      }
      setActiveSection(sections[currentIdx]);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: el.offsetTop - 100, behavior: 'smooth' });
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Clear error for this field if user begins typing
    if (missingFields.includes(name)) {
      setMissingFields(prev => prev.filter(f => f !== name));
    }
  };

  const handleClearForm = () => {
    if (window.confirm("¿Estás seguro de que quieres limpiar TODO el formulario? Los datos no guardados se perderán.")) {
      setFormData(DEFAULT_FORM_DATA);
      setMissingFields([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.docx')) {
      alert("Por favor sube un archivo Word (.docx)");
      return;
    }

    const data = new FormData();
    data.append('file', file);

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/extract`, {
        method: 'POST',
        body: data,
      });

      if (!response.ok) {
        throw new Error('Error al extraer datos');
      }

      const result = await response.json();
      if (result.extracted_data) {
        setFormData(prev => ({
          ...prev,
          ...result.extracted_data
        }));

        // Remove missing field errors for fields that got autofilled
        const extractedKeys = Object.keys(result.extracted_data);
        setMissingFields(prev => prev.filter(f => !extractedKeys.includes(f)));

        // Show lightweight toast insted of alert if possible, alert for now
        alert(`¡Éxito! Se extrajeron y autocompletaron ${extractedKeys.length} campos desde el documento. Por favor, verifica.`);
      }
    } catch (error) {
      console.error(error);
      alert("Hubo un error comunicándose con el servidor local: " + error.message);
    } finally {
      setIsLoading(false);
      e.target.value = null; // reset input wrapper
    }
  };

  const handleGenerate = async () => {
    const missing = [];
    for (let campo of OBLIGATORIOS) {
      if (!formData[campo] || formData[campo].toString().trim() === '') {
        missing.push(campo);
      }
    }

    if (missing.length > 0) {
      setMissingFields(missing);

      // Encontrar el primer elemento faltante y hacerle scroll para que el usuario lo vea
      // Simulamos la búsqueda por orden de las secciones
      const firstMissingFieldNode = document.querySelector(`[name="${missing[0]}"]`);
      if (firstMissingFieldNode) {
        firstMissingFieldNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstMissingFieldNode.focus();
      }

      alert(`Oops. Faltan ${missing.length} campos obligatorios. Revisa las áreas marcadas en rojo.`);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Error al generar los documentos en el servidor');
      }

      // Convert response to blob for ZIP download
      const blob = await response.blob();

      // Determine filename from response headers if possible, or use a default
      let filename = `Fichas_${formData.cedula || 'Generadas'}.pdf`;
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/["']/g, '');
      }

      // Create object URL and trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      if (window.confirm("¡Documentos PDF generados y descargados exitosamente!\n\n¿Deseas limpiar el formulario para comenzar un caso nuevo?")) {
        setFormData(DEFAULT_FORM_DATA);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      console.error(error);
      alert("Error crítico al generar documentos: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  /* ----- HELPERS UI ----- */
  const renderInputRow = (label, name, required = false, width = "col-span-1", type = "text") => {
    const isMissing = missingFields.includes(name);
    return (
      <div className={`flex flex-col space-y-1 ${width}`}>
        <label htmlFor={name} className="flex justify-between items-center text-sm font-semibold capitalize tracking-wide text-slate-700">
          <span>{label} {required && <span className="text-red-500 ml-0.5">*</span>}</span>
          {isMissing && <span className="text-xs font-semibold text-red-500 animate-pulse">Requerido</span>}
        </label>
        <input
          id={name}
          type={type}
          name={name}
          value={formData[name] || ''}
          onChange={handleInputChange}
          placeholder={`Ingresa ${label.toLowerCase()}...`}
          className={`rounded-xl border px-4 py-3 text-slate-900 transition-all outline-none ${isMissing
              ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 bg-red-50/50 hover:bg-red-50'
              : 'border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 bg-slate-50 hover:bg-white'
            }`}
        />
      </div>
    );
  };

  const renderSelectRow = (label, name, options, required = false, width = "col-span-1") => {
    const isMissing = missingFields.includes(name);
    return (
      <div className={`flex flex-col space-y-1 ${width}`}>
        <label htmlFor={name} className="flex justify-between items-center text-sm font-semibold capitalize tracking-wide text-slate-700">
          <span>{label} {required && <span className="text-red-500 ml-0.5">*</span>}</span>
          {isMissing && <span className="text-xs font-semibold text-red-500 animate-pulse">Requerido</span>}
        </label>
        <select
          id={name}
          name={name}
          value={formData[name] || ''}
          onChange={handleInputChange}
          className={`rounded-xl border px-4 py-3 text-slate-900 transition-all outline-none appearance-none bg-no-repeat bg-[center_right_1rem] bg-[length:1rem_1rem] bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2364748b%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] ${isMissing
              ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 bg-red-50/50 hover:bg-red-50'
              : 'border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 bg-slate-50 hover:bg-white'
            }`}
        >
          {options.map(opt => {
            const val = typeof opt === 'string' ? opt.toLowerCase() : opt.value;
            const lbl = typeof opt === 'string' ? opt : opt.label;
            return <option key={val} value={val}>{lbl}</option>
          })}
        </select>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100/50 text-slate-900 font-sans selection:bg-blue-100 flex flex-col items-center">

      {/* 🚀 Flotante Sticky Header: Panel de Controles */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200 shadow-sm sticky top-0 z-50 w-full transition-all support-backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center py-4 gap-4">

            {/* Logo y Branding */}
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl sm:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 tracking-tight">GFA</h1>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                  <span>Generador de Fichas Automáticas</span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                </p>
              </div>
            </div>

            {/* Controles Principales */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">

              {/* Reset Button */}
              <button
                onClick={handleClearForm}
                className="group relative flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 hover:text-red-500 hover:border-red-200"
                title="Limpiar Formulario (Se borrarán todos los campos)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden md:inline">Limpiar</span>
              </button>

              {/* Template Download Button */}
              <a
                href={`${API_URL}/api/template`}
                download="Plantilla_Defensoria.docx"
                className="group relative flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-sm font-bold text-emerald-600 transition-all hover:bg-emerald-50 hover:border-emerald-300"
                title="Descargar Plantilla Vacía"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="hidden md:inline">Descargar Plantilla</span>
              </a>

              {/* Upload Button */}
              <label className="relative cursor-pointer group">
                <div className="absolute inset-0 bg-blue-100 rounded-full blur transition-all group-hover:bg-blue-200 hidden sm:block"></div>
                <div className="relative flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-bold text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-100 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Cargar Word</span>
                </div>
                <input type="file" className="hidden" accept=".docx" onChange={handleFileUpload} disabled={isLoading} />
              </label>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="relative group overflow-hidden rounded-full p-[1px] shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 animate-[spin_3s_linear_infinite] group-hover:opacity-100 opacity-80" style={{ backgroundSize: '200% 200%' }}></span>
                <div className="relative flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-slate-800 disabled:opacity-70 disabled:cursor-not-allowed">
                  {isLoading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                  <span>{isLoading ? 'Trabajando...' : 'Generar Fichas'}</span>
                </div>
              </button>
            </div>

          </div>

          {/* Menu sub-navegacion para scroll rápido */}
          <div className="hidden md:flex gap-6 pb-2">
            {[
              { id: 'identificacion', label: 'Identificación' },
              { id: 'contacto', label: 'Contacto y Vida' },
              { id: 'proceso', label: 'Detalle del Proceso' }
            ].map(section => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`text-sm font-bold pb-2 border-b-2 transition-all ${activeSection === section.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 🚀 Main Form Content (Single Scroll Layout) */}
      <main className="w-full max-w-4xl px-4 sm:px-6 py-8 pb-32 space-y-12">

        {/* Banner Instrucciones */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-6 items-center">
          <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
            <span className="text-3xl">💡</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Carga Inteligente de Documentos</h2>
            <p className="text-slate-600 mt-1">
              Sube la ficha Word que recibiste usando el botón superior <strong>"Cargar Word"</strong>. El sistema llenará automáticamente en pantalla la mayor cantidad de datos que pueda detectar. ¡Puedes revisar y corregir antes de generar los PDFs finales! Tus avances se <strong className="text-green-600">guardan solos localmente</strong> por si recargas la página.
            </p>
          </div>
        </div>

        {/* --- SECCIÓN 1: IDENTIFICACIÓN --- */}
        <section id="identificacion" className="scroll-mt-32">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-blue-600 text-white p-2 rounded-lg shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800">1. Identificación del Procesado</h2>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 hover:shadow-md transition-shadow">
            {renderInputRow("Primer Nombre", "primer_nombre", true)}
            {renderInputRow("Segundo Nombre", "segundo_nombre")}
            {renderInputRow("Primer Apellido", "primer_apellido", true)}
            {renderInputRow("Segundo Apellido", "segundo_apellido", true)}

            <div className="col-span-1 md:col-span-2 border-t border-slate-100 my-2"></div>

            {renderSelectRow("Tipo Doc.", "tipo_documento", ["CC", "TI", "CE"], true)}
            {renderInputRow("Nº Cédula / Documento", "cedula", true)}
            {renderInputRow("Expedida en", "expedida_en", true)}
            {renderInputRow("Fecha Expedición", "fecha_expedicion")}

            {renderInputRow("F. Nacimiento (DD-MM-YYYY)", "fecha_nacimiento", true)}
            {renderInputRow("Nacionalidad", "nacionalidad", true)}
            {renderSelectRow("Sexo/Género", "sexo", ["Masculino", "Femenino", "Otro"])}
          </div>
        </section>

        {/* --- SECCIÓN 2: CONTACTO Y VIDA --- */}
        <section id="contacto" className="scroll-mt-32">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-500 text-white p-2 rounded-lg shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800">2. Contacto y Perfil Social</h2>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-slate-200 hover:shadow-md transition-shadow space-y-8">

            {/* Sub-seccion: Ubicacion */}
            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Ubicación y Localización</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderInputRow("Dirección de Residencia", "direccion", true, "col-span-1 md:col-span-2")}
                {renderInputRow("Departamento", "departamento", true)}
                {renderInputRow("Municipio", "municipio", true)}
                {renderInputRow("Barrio", "barrio")}
                {renderInputRow("Vereda o Corregimiento", "vereda")}

                {renderInputRow("Celular de Contacto", "celular", true, "col-span-1", "tel")}
                {renderInputRow("Teléfono Fijo / Secundario", "telefono", false, "col-span-1", "tel")}
                {renderInputRow("Correo Electrónico", "correo", false, "col-span-1 md:col-span-2", "email")}
              </div>
            </div>

            <div className="border-t border-slate-100"></div>

            {/* Sub-seccion: Social */}
            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Socioeconómico</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {renderSelectRow("Nivel Educativo", "nivel_educativo", [
                  "Ninguno", "Primaria incompleta", "Primaria completa",
                  "Bachiller incompleto", "Bachiller completo", "Técnico/Tecnólogo",
                  "Universitario", "Posgrado"
                ], true, "col-span-1 md:col-span-2")}

                {renderSelectRow("Estado civil", "estado_civil", ["Soltero", "Casado", "Separado", "Viudo", "Unión libre"])}
                {renderInputRow("No. de Hijos", "n_hijos", true, "col-span-1 w-full", "number")}
                {renderInputRow("Estrato", "estrato", true, "col-span-1 w-full", "number")}
                {renderSelectRow("Vivienda", "vivienda", ["Propia", "Arrendada", "Familiar", "Otros"])}

                {renderSelectRow("Sit. Laboral", "situacion_laboral", ["Dependiente", "Independiente", "Desempleado", "Estudiante", "Otros"])}
                {renderInputRow("Profesión, Cargo o Empresa", "cargo", false, "col-span-1 md:col-span-2")}
                {renderInputRow("Ingreso Mensual Aprox.", "ingreso_mensual")}
              </div>
            </div>

          </div>
        </section>

        {/* --- SECCIÓN 3: DETALLE DEL PROCESO --- */}
        <section id="proceso" className="scroll-mt-32">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-rose-500 text-white p-2 rounded-lg shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-800">3. Detalles del Proceso Judicial</h2>
          </div>

          <div className="bg-white rounded-3xl flex flex-col p-6 sm:p-10 shadow-sm border border-slate-200 hover:shadow-md transition-shadow gap-8">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {renderInputRow("RUS", "rus", true)}
              {renderInputRow("RUC", "ruc", true)}
              {renderInputRow("Lugar de Recepción", "lugar_recepcion", true)}
              {renderInputRow("Fecha de Recepción", "fecha_recepcion", true, "col-span-1", "date")}
              {renderInputRow("Conducta Punible / Delito", "conducta_punible", true, "col-span-1 md:col-span-2")}
            </div>

            <div className="border-t border-slate-100"></div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {renderInputRow("Núm. Radicado de Proceso (21 dígitos)", "numero_proceso", true, "col-span-1 md:col-span-2")}
              {renderInputRow("Fecha y Hora de Captura", "fecha_hora_captura", true)}
              {renderInputRow("Fiscal de Conocimiento / Garantías", "fiscal", true)}
              {renderInputRow("Despacho Judicial / Juez", "juez", true, "col-span-1 md:col-span-2")}
            </div>

            <div className="border-t border-slate-100"></div>

            <div className="flex flex-col gap-4">
              {/* Privado de la libertad toggle */}
              <label className="flex items-center gap-4 p-5 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors w-full group">
                <div className="relative flex items-center shrink-0">
                  <input type="checkbox" name="privado_libertad" checked={formData.privado_libertad} onChange={handleInputChange} className="peer h-6 w-6 cursor-pointer appearance-none rounded-md border-2 border-slate-300 checked:border-rose-500 checked:bg-rose-500 transition-all focus:ring-4 focus:ring-rose-200" />
                  <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div>
                  <span className="block font-bold text-slate-800 text-lg group-hover:text-rose-600 transition-colors">¿Usuario Privado de la Libertad?</span>
                  <span className="text-slate-500 text-sm">Marcar si el procesado se encuentra actualmente bajo custodia en una celda o cárcel.</span>
                </div>
              </label>

              {formData.privado_libertad && (
                <div className="animate-in slide-in-from-top-4 fade-in duration-300">
                  {renderInputRow("Nombre del Centro de Reclusión, Cárcel o Estación", "centro_reclusion", true, "col-span-1 w-full")}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100"></div>

            {/* Hechos - Textarea gigantesco */}
            <div className="flex flex-col space-y-2">
              <label htmlFor="resumen_hechos" className={`text-lg font-bold flex items-center justify-between ${missingFields.includes('resumen_hechos') ? 'text-red-500' : 'text-slate-800'}`}>
                <span>Resumen de los Hechos <span className="text-red-500">*</span></span>
                {missingFields.includes('resumen_hechos') && <span className="text-sm font-semibold text-red-500 animate-pulse">Este campo es completamente obligatorio</span>}
              </label>
              <p className="text-slate-500 text-sm mb-2">Escriba una síntesis comprensible de los sucesos fácticos materia de investigación.</p>
              <textarea
                id="resumen_hechos"
                name="resumen_hechos"
                rows={8}
                value={formData.resumen_hechos || ''}
                onChange={handleInputChange}
                placeholder="Describa extensamente los hechos aquí..."
                className={`block w-full rounded-2xl border p-5 transition-all outline-none text-slate-900 resize-y leading-relaxed text-base ${missingFields.includes('resumen_hechos')
                    ? 'border-red-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/20 bg-red-50/50 hover:bg-red-50'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 bg-slate-50 hover:bg-white'
                  }`}
              />
            </div>

          </div>
        </section>

        {/* Submit final en la parte inferior */}
        <div className="flex justify-end pt-8">
          <button
            onClick={handleGenerate}
            disabled={isLoading}
            className="group relative flex items-center justify-center gap-3 w-full md:w-auto rounded-full bg-slate-900 px-10 py-4 text-lg font-black text-white transition-all hover:bg-black focus:ring-4 focus:ring-slate-900/30 disabled:opacity-70 disabled:cursor-not-allowed shadow-xl shadow-slate-900/20 active:scale-95"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Generando Fichas PDF...</span>
              </>
            ) : (
              <>
                <span>Terminar y Generar Fichas Automáticas</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 transition-transform group-hover:translate-x-1 group-active:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>

      </main>
    </div>
  );
}

export default App;
