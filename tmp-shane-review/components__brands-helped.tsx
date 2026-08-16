"use client";

import Image from "next/image";

export function BrandsHelped() {
  const champions = [
    {
      name: "Allen Bolen",
      title: "WWE Champion",
      image: "/api/attachments/PluL95oYVyJVv15B3t0CI",
      width: 312,
      height: 505,
    },
    {
      name: "Bobby Lashley",
      title: "MMA Champion and Inspirational Leader",
      image: "/api/attachments/5cz75HiRr3KjaqsNZ74ZT",
      width: 513,
      height: 521,
      isFeatured: true,
    },
    {
      name: "Miesha Tate",
      title: "Innovative Entrepreneur and Author",
      image: "/api/attachments/Pgwg-Z4pBQvj4oGraoCBg",
      width: 398,
      height: 474,
    },
  ];

  return (
    <section className="w-full bg-black py-16 lg:py-24 overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-center text-white font-bold text-[32px] sm:text-[40px] leading-[50px] mb-16">
          Discover the Brands We’ve Helped Grow
        </h2>

        {/* Champions showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end justify-center">
          {champions.map((person, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center text-center group"
            >
              {/* Image Container */}
              <div
                className={`relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl transition-transform duration-300 group-hover:scale-[1.02] ${
                  person.isFeatured
                    ? "w-full max-w-[420px] h-[480px] sm:h-[520px] z-10"
                    : "w-full max-w-[340px] h-[420px] sm:h-[470px]"
                }`}
              >
                <Image
                  src={person.image}
                  alt={person.name}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 768px) 100vw, 420px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Text Info Below */}
              <div className="mt-6 flex flex-col items-center space-y-1">
                <p className="text-[#ffffff] font-light text-[16px] sm:text-[18px] leading-[25px] min-h-[50px] flex items-center justify-center max-w-[280px]">
                  {person.title}
                </p>
                <h3 className="text-white font-bold text-[26px] sm:text-[30px] leading-[37px]">
                  {person.name}
                </h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
