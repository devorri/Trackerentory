# Supabase Auth vs `users` table

TrackErentory login uses **Supabase Authentication**, not the `password` column in `public.users` directly.

## How sign-in works

1. You enter **username** + **password** on the login page.
2. The app converts the username to a Supabase Auth email:

   `{username}.trackerentory@local.test`

   Examples:
   - `juan` → `juan.trackerentory@local.test`
   - `Maria Cruz` → `maria.cruz.trackerentory@local.test`

3. Supabase Auth checks that email + password.
4. If auth succeeds, the app loads your profile from `public.users` where `auth_id` matches.

## Why "Invalid login credentials" happens

This usually means **there is no Supabase Auth account** for that username — even if a row exists in `public.users` with the same username/password.

Common cases:

- Users were inserted manually in the Table Editor or SQL seed script
- `auth_id` is `NULL` on the `users` row
- Password in `users` was changed but not updated in Supabase Auth

## Option A — New Customer / Renter (easiest)

Use **Sign up** on the login page. That creates both:

- Supabase Auth user
- Linked `users` row with `auth_id`

## Option B — Link an existing database user

For users already in `public.users` (e.g. Owner, Staff):

1. Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. **Email:** use the mapped email for their username  
   Example: username `owner` → `owner.trackerentory@local.test`
3. **Password:** set the password they should use to log in
4. Copy the new user's **UUID**
5. SQL Editor:

```sql
UPDATE public.users
SET auth_id = 'paste-auth-user-uuid-here'
WHERE username = 'owner';
```

6. Sign in with **username** `owner` (not the email) and the password you set in step 3.

## Check if a user is linked

```sql
SELECT user_id, username, role, auth_id
FROM public.users
ORDER BY user_id;
```

`auth_id` must be filled for login to work after auth succeeds.
