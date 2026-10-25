interface AboutPageProps {
  onBack: () => void;
}

/** Kredit proyek. Semua gambar dibundel lokal agar tersedia saat offline. */
function AboutPage({ onBack }: AboutPageProps) {
  return (
    <section className="about-page" aria-labelledby="about-title">
      <button
        className="about-back"
        type="button"
        onClick={onBack}
        aria-label="Kembali ke pemeriksaan"
        title="Kembali ke pemeriksaan"
        autoFocus
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 12H4m7-7-7 7 7 7" />
        </svg>
      </button>

      <h1 className="about-pill" id="about-title">About Us</h1>
      <p className="about-intro">Proyek ini direalisasikan oleh</p>

      <figure className="about-creator">
        <img className="about-portrait about-portrait--creator" src="/about/galang.png" alt="Galang Afdala Harsa" width="64" height="74" />
        <figcaption>
          <span>Galang Afdala Harsa</span>
          <span>535230138 · Teknik Informatika</span>
        </figcaption>
      </figure>

      <h2 className="about-pill about-mentors-title">Dengan bimbingan dari</h2>
      <div className="about-mentors">
        <figure>
          <img className="about-portrait about-portrait--viny" src="/about/viny-christanti.jpg" alt="Viny Christanti Mawardi" width="76" height="76" />
          <figcaption>
            <span>Viny Christanti Mawardi,</span>
            <span>S.Kom., M.Kom.</span>
          </figcaption>
        </figure>
        <figure>
          <img className="about-portrait" src="/about/daniel-jahja.webp" alt="Daniel Jahja Surjawan" width="76" height="76" />
          <figcaption>
            <span>Daniel Jahja Surjawan,</span>
            <span>S.Kom., M.T.</span>
          </figcaption>
        </figure>
      </div>

      <div className="about-logos" aria-label="Institusi dan program">
        <img src="/about/untar-fti.png" alt="UNTAR, Fakultas Teknologi Informasi" width="139" height="53" />
        <img src="/about/coding-camp.png" alt="Coding Camp 2026 powered by DBS Foundation" width="146" height="49" />
      </div>
    </section>
  );
}

export default AboutPage;
