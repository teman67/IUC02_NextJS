'use client'

import Image from 'next/image'

export default function AboutPage() {
  const teamMembers = [
    { name: "Mariano Forti", affiliation: "Ruhr-Universität Bochum, Bochum, Nordrhein-Westfalen, Germany", link: "https://www.mpie.de/4917874/Forti" },
    { name: "Angelika Gedsun", affiliation: "Albert-Ludwigs-Universität Freiburg, Freiburg im Breisgau, Baden-Württemberg, Germany", link: "https://livmats.uni-freiburg.de/de/people/postdoctoral-researchers/angelika-gedsun" },
    { name: "Yusra Shakeel", affiliation: "KarlsruheInstitute of Technology, Kalrsruhe, Baden-Württemberg, Germany", link: "https://www.dbse.ovgu.de/en/Staff/Externe+Doktoranden/Yusra+Shakeel.html" },
    { name: "Ebrahim Norouzi", affiliation: "FIZ Karlsruhe – Leibniz-Institute for Information Infrastructure GmbH, Kalrsruhe, Baden-Württemberg, Germany", link: "https://www.fiz-karlsruhe.de/de/bereiche/lebenslauf-und-publikationen-ebrahim-norouzi" },
    { name: "Ying Han", affiliation: "Bundesanstalt für Materialforschungund-prüfung(BAM), Berlin, Germany", link: "https://www.xing.com/profile/Ying_Han6" },
    { name: "Luis Alexander Ávila Calderón ", affiliation: "Bundesanstalt für Materialforschungund-prüfung(BAM), Berlin, Germany", link: "https://orcid.org/0000-0003-0012-2414" },
    { name: "Amirreza Daei Rezaei Moghaddam", affiliation: "RWTH Aachen, Aachen, Nordrhein-Westfalen, Germany ", link: "https://www.itc.rwth-aachen.de/cms/it-center/it-center/profil/team/~epvp/mitarbeiter-campus-/?gguid=PER-964N3TN&allou=1&lidx=1" },
    { name: "Pavlina Kruzikova", affiliation: "Bundesanstalt für Materialforschungund-prüfung(BAM), Berlin, Germany", link: "https://www.linkedin.com/in/pavlina-kruzikova/?originalSubdomain=de" },
    { name: "Amirhossein Bayani (Developer of the Application)", affiliation: "Albert-Ludwigs-Universität Freiburg, Freiburg im Breisgau, Baden-Württemberg, Germany", link: "https://www.linkedin.com/in/amirhosseinbayani/" }
  ]

  const logos = [
    { file: "BAM_logo.png", alt: "BAM Logo" },
    { file: "FIZ_logo.png", alt: "FIZ Logo" },
    { file: "Freiburg_logo.png", alt: "Freiburg Logo" },
    { file: "KIT_logo.png", alt: "KIT Logo" },
    { file: "RUB_logo.png", alt: "RUB Logo" },
    { file: "RWTH_logo.png", alt: "RWTH Logo" },
  ]

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <h2 className="section-title mb-8">Team Members</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
        {teamMembers.map((member, index) => (
          <a
            key={index}
            href={member.link}
            target="_blank"
            rel="noopener noreferrer"
            className="card hover:border-2 hover:border-primary-400 group transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl group-hover:scale-110 transition-transform">👤</span>
              <div>
                <h3 className="font-bold text-lg text-primary-700 group-hover:text-primary-900 transition-colors mb-1">
                  {member.name}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">{member.affiliation}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="card bg-gradient-to-br from-gray-50 to-blue-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Partner Institutions</h2>
        <div className="flex justify-center items-center flex-wrap gap-8">
          {logos.map((logo, index) => (
            <div key={index} className="transition-transform hover:scale-110 duration-300 p-4 bg-white rounded-lg shadow-soft hover:shadow-medium">
              <Image
                src={`/images/${logo.file}`}
                alt={logo.alt}
                width={150}
                height={70}
                className="object-contain h-[70px] w-auto"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
