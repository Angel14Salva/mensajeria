// =============================================
//  CONFIGURACIÓN DE SUPABASE
//  Reemplaza los valores con los de tu proyecto
// =============================================

const SUPABASE_URL = 'https://bbbwekrbeupuaymqxxgk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eyrvvqmYxJsYxg8ZGnDaaw_nj8CN7z2';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);