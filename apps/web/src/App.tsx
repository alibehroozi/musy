import { Typography } from "@moc/design-system";

export function App(): JSX.Element {
  return (
    <main className="max-w-3xl mx-auto p-8 flex flex-col gap-4">
      <Typography variant="h1">musy</Typography>
      <Typography variant="body">Music app with AI-powered taste processing.</Typography>
    </main>
  );
}
