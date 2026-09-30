// Yarış kaskı simgesi (araç / sürücü sayısı yanında)
export function Helmet(props: { class?: string }) {
  return (
    <svg class={`ov-helmet ${props.class ?? ""}`} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.2 3C6.9 3 3 6.9 3 12.1c0 2 .5 3.6 1.3 4.9.5.8 1.3 1.3 2.3 1.4l7.4.6c1 .1 1.9-.5 2.2-1.4l.4-1.1h3.2c1.2 0 2.2-1 2.2-2.2v-1.1C22 7.6 17.7 3 12.2 3Zm7.5 9.2h-7.1c-.8 0-1.4-.6-1.4-1.4V9.3c0-.8.6-1.4 1.4-1.4h5c1 1.2 1.7 2.7 2.1 4.3Z"
      />
    </svg>
  );
}
