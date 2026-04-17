Lokal email-bekræftelsesside (localhost:3000)

Når Supabase "Site URL" er http://localhost:3000, skal denne mappe serveres på port 3000,
ellers får du ERR_CONNECTION_REFUSED efter klik i mailen.

Fra projektrod:
  npm run serve:email-confirm

Lad terminalen køre, mens du tester. Åbn derefter bekræftelseslinket i mailen igen.

Produktion: sæt Site URL til https://gymlyapp.com og deploy web/auth-confirm/ (se web/auth-confirm/README.txt).
