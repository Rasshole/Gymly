/**
 * DM chat images: upload to Supabase Storage, store public URL on dm_messages.image_url
 * Path: {userId}/{threadId}/{unique}.{ext} — RLS allows insert only under own userId prefix
 */

import {supabase} from '@/services/supabase/supabaseClient';

const BUCKET = 'dm-images';

function extAndContentType(
  localUri: string,
  mime: string | null | undefined,
): {ext: string; contentType: string} {
  const m = (mime || '').toLowerCase();
  if (m.includes('png')) {
    return {ext: 'png', contentType: 'image/png'};
  }
  if (m.includes('heic') || m.includes('heif')) {
    return {ext: 'heic', contentType: m.includes('heif') ? 'image/heif' : 'image/heic'};
  }
  if (m.includes('webp')) {
    return {ext: 'webp', contentType: 'image/webp'};
  }
  if (m.includes('jpeg') || m.includes('jpg')) {
    return {ext: 'jpg', contentType: 'image/jpeg'};
  }
  if (/\.png($|\?)/i.test(localUri)) {
    return {ext: 'png', contentType: 'image/png'};
  }
  if (/\.heic($|\?)/i.test(localUri)) {
    return {ext: 'heic', contentType: 'image/heic'};
  }
  if (/\.webp($|\?)/i.test(localUri)) {
    return {ext: 'webp', contentType: 'image/webp'};
  }
  return {ext: 'jpg', contentType: 'image/jpeg'};
}

/**
 * @param mime optional react-native-image-picker `asset.type`
 */
export async function uploadDmChatImage(
  localUri: string,
  threadId: string,
  mime?: string | null,
): Promise<string> {
  const {data: userData, error: authErr} = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (authErr || !uid) {
    throw new Error('Ikke logget ind');
  }

  const res = await fetch(localUri);
  if (!res.ok) {
    throw new Error('Kunne ikke læse billedet.');
  }
  const body = await res.arrayBuffer();
  const {ext, contentType} = extAndContentType(localUri, mime);

  const path = `${uid}/${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const {error: uploadError} = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    throw new Error(uploadError.message || 'Upload fejlede');
  }

  const {data: pub} = supabase.storage.from(BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}
