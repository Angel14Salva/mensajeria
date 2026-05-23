// =============================================
//  CONFIGURACIÓN DE SUPABASE
//  Reemplaza los valores con los de tu proyecto
// =============================================

const SUPABASE_URL = 'https://TU_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
