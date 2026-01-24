# Twitter/X OAuth Setup Guide

This guide explains how to set up Twitter/X authentication for the Sperm.io application.

## Overview

The application now uses Twitter/X OAuth 2.0 for user authentication instead of username/password registration. When users authenticate with Twitter, a profile is automatically created with a Solana wallet.

## Setup Steps

### 1. Create Twitter/X Developer App

1. Go to [developer.x.com](https://developer.x.com)
2. Sign in with your Twitter/X account
3. Click **+ Create Project**
4. Enter project name, use case, and description
5. Create an app with **Web App** type
6. Under **User authentication settings**:
   - Enable **Request email from users**
   - Set **App permissions** (read is sufficient)
   - Enter your **Callback URL**: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Enter **Website URL**: `http://127.0.0.1:5173` (for local development)
   - Add Terms of Service and Privacy Policy URLs

7. Save your **API Key** (Client ID) and **API Secret Key** (Client Secret)

### 2. Configure Supabase

1. Go to your [Supabase Project Dashboard](https://supabase.com/dashboard)
2. Navigate to **Authentication** → **Providers**
3. Find **X / Twitter (OAuth 2.0)** and enable it
4. Enter your Twitter **Client ID** and **Client Secret**
5. Click **Save**

### 3. Environment Variables

Make sure your Supabase configuration is properly set in your environment:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## How It Works

1. **User clicks "Continue with X / Twitter"**
2. **OAuth redirect**: User is redirected to Twitter for authentication
3. **Callback**: Twitter redirects back to the app with authorization code
4. **Session creation**: Supabase creates a user session
5. **Profile creation**: App creates a user profile and Solana wallet
6. **Seedphrase display**: User sees their wallet seedphrase for backup

## User Flow

- New Twitter users get a new profile and wallet created automatically
- Existing Twitter users get their existing profile and wallet loaded
- Users can recover their account using their seedphrase in settings
- Profile photos from Twitter are automatically imported

## Security Notes

- Seedphrases are encrypted and stored securely
- Users should backup their seedphrase for wallet recovery
- Twitter authentication is handled through Supabase's secure OAuth flow
- No Twitter passwords are stored or handled by the application

## Testing

1. Run the application locally: `npm run dev`
2. Click "Continue with X / Twitter"
3. Complete the Twitter authentication flow
4. Verify that a profile and wallet are created
5. Check that the seedphrase is displayed correctly

## Troubleshooting

### Common Issues

1. **Callback URL mismatch**: Ensure the callback URL in Twitter developer portal matches your Supabase URL
2. **CORS errors**: Make sure your website URL is properly configured in Twitter app settings
3. **Missing user data**: Check that email permissions are enabled in Twitter app settings
4. **Profile creation fails**: Verify Supabase database permissions and wallet service is working

### Debug Mode

Enable console logging to debug authentication issues:
- Check browser console for `[Auth]` log messages
- Verify OAuth flow steps in network tab
- Check Supabase dashboard for user creation

## Migration from Username/Password

The old username/password authentication system has been completely replaced. Existing users will need to:
1. Authenticate with Twitter
2. Create a new profile and wallet
3. Manually transfer any funds from old accounts if needed

The old authentication methods are still available in the codebase for reference but are no longer exposed in the UI.
