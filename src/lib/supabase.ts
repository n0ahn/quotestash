import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from './database.types';

export const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true
    }
});

/**
 * Convenience helper — the current logged-in user's profile row (users table),
 * not just the raw Supabase auth user. Returns null when signed out.
 */
export async function getCurrentProfile() {
    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user) return null;

    // 1. Haal profiel op
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();

    if (error) {
        console.error('Failed to load profile', error);
        return null;
    }

    // 2. Self-healing: als het profiel ontbreekt, maak het direct aan
    if (!data) {
        const firstName = user.user_metadata?.first_name || '';
        
        // Cast het object naar 'any' om de 'never[]' TypeScript check te omzeilen
        const { data: newProfile, error: createError } = await supabase
            .from('users')
            .insert({ 
                id: user.id, 
                first_name: firstName,
                email: user.email 
            } as any)
            .select()
            .single();

        if (createError) {
            console.error('Failed to auto-create missing profile', createError);
            return null;
        }

        return newProfile;
    }

    return data;
}