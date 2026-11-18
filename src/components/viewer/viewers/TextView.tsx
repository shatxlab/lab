export function TextView({ text }: { text: string }) {
  return (
    <div className="h-full overflow-auto" data-print-flow="">
      <pre className="mx-auto w-full max-w-3xl whitespace-pre-wrap break-words px-4 py-8 font-mono text-[0.9375rem] leading-relaxed sm:px-6 sm:py-10">
        {text}
      </pre>
    </div>
  );
}
