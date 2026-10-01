import { test, expect } from '@playwright/test'

test('login allows a short existing password and preserves invitation destination', async ({ page }) => {
  await page.goto('/login?next=%2Finvite%3Ftoken%3Dtest')
  await page.getByLabel('Email', { exact: true }).fill('test@example.test')
  const password=page.getByLabel('Password',{exact:true})
  await password.fill(' a ')
  expect(await password.evaluate(input=>input.validity.valid)).toBe(true)
  await expect(page.locator('input[name="next"]')).toHaveValue('/invite?token=test')
  await page.getByRole('link',{name:'Reset Password',exact:true}).click()
  await expect(page.locator('input[name="next"]')).toHaveValue('/invite?token=test')
})
test('signup requires terms and enforces a new-password minimum',async({page})=>{
  await page.goto('/signup')
  await page.getByLabel('Email',{exact:true}).fill('test@example.test')
  const password=page.getByLabel('Password',{exact:true})
  await password.fill('short')
  expect(await password.evaluate(input=>input.validity.tooShort)).toBe(true)
  await expect(page.locator('input[name="terms"]')).not.toBeChecked()
})
test('confirmation failure explains how to recover',async({page})=>{
  await page.goto('/login?error=invalid_confirmation')
  await expect(page.getByText('This email link is invalid, expired, or already used. Request a new confirmation or reset link.')).toBeVisible()
})
test('password update without an email grant is rejected',async({page})=>{
  await page.goto('/reset-password')
  await page.locator('input[name="password"]').fill('test-password-123')
  await page.locator('input[name="confirmPassword"]').fill('test-password-123')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText(/Authentication is temporarily unavailable|This password link is invalid or expired/)).toBeVisible()
  await expect(page).toHaveURL(/\/reset-password$/)
})
test('invites ask the recipient to sign in before acceptance',async({page})=>{
  let accepts=0
  page.on('request',request=>{if(request.url().includes('/invitations/accept'))accepts++})
  await page.goto('/invite?token=test')
  await expect(page.getByText('Sign in or create an account with the invited email address.')).toBeVisible()
  await expect(page.getByRole('link',{name:'Login',exact:true})).toHaveAttribute('href',/next=%2Finvite/)
  expect(accepts).toBe(0)
})
test('malformed callback credentials cannot redirect to an external next URL',async({request})=>{
  for(const query of ['type=signup','type=signup&next=%2F%0A%2Fevil.example','type=magiclink&token_hash=x','type=signup&code=x&token_hash=y']){
    const response=await request.get(`/auth/callback?${query}`,{maxRedirects:0})
    expect(response.status()).toBe(307)
    const location=new URL(response.headers().location)
    expect(location.hostname).not.toBe('evil.example')
    expect(location.pathname).toBe('/login')
  }
})

test('cookie-authenticated API mutations reject untrusted origins',async({request})=>{
  for(const headers of [{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site',Origin:'https://app.listhygiene.com'},{}]){
    const response=await request.post('/api/organizations/invitations/accept',{headers:{Cookie:'sb-test-auth-token=dummy',...headers},data:{token:'test'}})
    expect(response.status()).toBe(403)
  }
})
