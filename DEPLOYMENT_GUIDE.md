# Fantasy Golf App - Vercel Deployment Guide

## Prerequisites

1. **Supabase Project**: You need a Supabase project with the following:
   - Project URL (NEXT_PUBLIC_SUPABASE_URL)
   - Anonymous key (NEXT_PUBLIC_SUPABASE_ANON_KEY)

2. **Vercel Account**: You need a Vercel account and the Vercel CLI installed

## Step-by-Step Deployment

### 1. Set Up Environment Variables

Create a `.env.local` file in your project root with your actual Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Deploy to Vercel

#### Option A: Using Vercel CLI

```bash
# Install Vercel CLI if you haven't already
npm i -g vercel

# Deploy your project
vercel --prod
```

#### Option B: Using Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your repository
4. Configure the build settings:
   - Build Command: `npm run build`
   - Output Directory: `out`
   - Framework: Next.js

### 3. Configure Environment Variables in Vercel

After importing your project, you need to add the required environment variables:

1. Go to your project's dashboard on Vercel
2. Click "Settings" → "Environment Variables"
3. Add these variables:

| Variable Name | Value | Type |
|---------------|-------|------|
| NEXT_PUBLIC_SUPABASE_URL | your_supabase_project_url | Plaintext |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | your_supabase_anon_key | Plaintext |

### 4. Deploy

Click the "Deploy" button to deploy your application.

## Troubleshooting

### Common Issues

1. **"Environment variables not found" error**
   - Make sure you've added the environment variables in Vercel's dashboard
   - Check that the variable names match exactly

2. **Build failures**
   - Ensure you have a valid `package.json` with correct scripts
   - Check that all dependencies are properly installed

3. **Runtime errors**
   - Verify your Supabase credentials are correct
   - Check that your Supabase project is properly configured

### Debug Commands

```bash
# Check package.json scripts
npm run build

# Check for missing dependencies
npm ls

# Check environment variables locally
node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"
```

## Post-Deployment

1. **Test your application**: Visit your deployed URL and test all functionality
2. **Set up custom domain**: If needed, configure a custom domain in Vercel
3. **Enable analytics**: Set up Vercel Analytics for performance monitoring

## Security Notes

- Never commit your actual `.env` file to version control
- Use the `.env.example` file as a template for others
- Keep your Supabase credentials secure

## Support

If you encounter issues during deployment:
- Check the Vercel documentation: https://vercel.com/docs
- Review your Supabase project configuration
- Test the build process locally first