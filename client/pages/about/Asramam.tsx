export default function AboutAsramam() {
  return (
    <main className="container py-10 md:py-14">
      <h1 className="text-3xl font-extrabold tracking-tight">Asramam</h1>

      <div className="mt-6 grid gap-6 md:grid-cols-2 items-start">
        {/* Left: Text */}
        <div className="text-muted-foreground space-y-4 max-w-prose">
          <p>
            Srimath Sathguru Santhananda Swamiji had a dream of founding an
            Asramam in Chennai, the Capital City of Tamil Nadu. Eventually, his
            dream became a reality and the Asramam now is functioning in No 1
            Kambar Street, Rajakilpakkam, East Tambaram, Chennai 600 073.
          </p>
          <p>
            The dedication ceremony for the Ashram was held on 24th June of 1999
            under the guidance of his holiness.
          </p>
          <p>
            It is Swamiji’s belief that if the Vedas are protected the world
            will prosper. Therefore, he is conducting Yajurveda Patasalas in
            Pudukkottai and Skandagiri. Here students get free boarding and
            lodging facilities. After Swamiji, who? Swamiji is never worried
            about the future. He has established two trusts, one for Pudukkottai
            Adhishtanam and another for Skandasramam. These trusts maintain
            accounts meticulously and up-to date. For the dissemination of
            spiritual ideas and to encourage scholars of Hinduism to express
            their ideas, Swamiji is conducting a Tamil monthly, “Sri
            Bhuvaneswari Vijayam”.
          </p>
        </div>

        {/* Right: Image */}
        <div>
          <div className="rounded-xl overflow-hidden border bg-muted">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F982c525ed71b4aecb07284a69278ef3d%2F55f20fd625ba4e1c820eda890cdb06e4?format=webp&width=800"
              alt="Sri Dattatreya – Asramam depiction"
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
