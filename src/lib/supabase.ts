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

    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();

    if (error) {
        console.error('Failed to load profile', error);
        return null;
    }

    if (!data) {
        const { data: newProfile, error: createError } = await supabase
            .from('users')
            .insert({
                id: user.id,
                first_name: user.user_metadata?.first_name || '',
                email: user.email ?? ''
            })
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

/**
 * Uploads a new profile picture to the `avatars` storage bucket and updates
 * the user's `avatar_url` in the `users` table. Returns the new public URL,
 * or null on failure.
 */
export async function uploadAvatar(file: File): Promise<string | null> {
    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user) return null;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' });

    if (uploadError) {
        console.error('Failed to upload avatar', uploadError);
        return null;
    }

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
    // Bust caches (e.g. when re-uploading to the same path) with a version query param.
    const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);

    if (updateError) {
        console.error('Failed to save avatar url', updateError);
        return null;
    }

    return avatarUrl;
}

/**
 * Removes the current user's profile picture.
 */
export async function removeAvatar(): Promise<boolean> {
    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user) return false;

    const { error } = await supabase.from('users').update({ avatar_url: null }).eq('id', user.id);

    if (error) {
        console.error('Failed to remove avatar', error);
        return false;
    }

    return true;
}

/**
 * Uploads a group photo for a room to the `room-photos` storage bucket and
 * updates the room's `photo_url`. The `rooms.photo_url` update itself is
 * still gated by table-level RLS to the room owner; the storage path is
 * namespaced under the uploader's own user id (see
 * fix_room_photo_rls_v2.sql) since a lookup-based storage policy tied to
 * `rooms.owner_id` is prone to RLS timing issues right after a room is
 * created. Returns the new public URL, or null on failure.
 */
export async function uploadRoomPhoto(roomId: string, file: File): Promise<string | null> {
    const {
        data: { user }
    } = await supabase.auth.getUser();

    if (!user) return null;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${roomId}-photo.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('room-photos')
        .upload(path, file, { upsert: true, cacheControl: '3600' });

    if (uploadError) {
        console.error('Failed to upload room photo', uploadError);
        return null;
    }

    const { data: publicUrlData } = supabase.storage.from('room-photos').getPublicUrl(path);
    const photoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase.from('rooms').update({ photo_url: photoUrl }).eq('id', roomId);

    if (updateError) {
        console.error('Failed to save room photo url', updateError);
        return null;
    }

    return photoUrl;
}

/**
 * Removes a room's group photo.
 */
export async function removeRoomPhoto(roomId: string): Promise<boolean> {
    const { error } = await supabase.from('rooms').update({ photo_url: null }).eq('id', roomId);

    if (error) {
        console.error('Failed to remove room photo', error);
        return false;
    }

    return true;
}