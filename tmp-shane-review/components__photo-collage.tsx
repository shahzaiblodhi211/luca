"use client";

import Image from "next/image";

export function PhotoCollage() {
  const photos = [
    {
      src: "/api/attachments/LcjxxtVHiHz7gBaQJsrlA",
      alt: "Shane Hall lifestyle 1",
      className: "w-[114px] h-[195px] rounded-lg",
    },
    {
      src: "/api/attachments/VX1pLefUqYQX4OQjbYgBZ",
      alt: "Shane Hall lifestyle 2",
      className: "w-[145px] h-[216px] rounded-[117px]",
    },
    {
      src: "/api/attachments/XecwVP-uEMREhtLIXjbwK",
      alt: "Shane Hall lifestyle 3",
      className: "w-[269px] h-[200px] rounded-[100px]",
    },
    {
      src: "/api/attachments/mogJJdsww1P6h8d6SUglb",
      alt: "Shane Hall lifestyle 4",
      className: "w-[183px] h-[195px] rounded-2xl",
    },
    {
      src: "/api/attachments/NztEPre2R5ws_YAOqB6XS",
      alt: "Shane Hall lifestyle 5",
      className: "w-[145px] h-[216px] rounded-[117px]",
    },
  ];

  return (
    <section className="w-full bg-black py-12 overflow-x-auto no-scrollbar">
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-center gap-4 sm:gap-6 min-w-[900px]">
        {photos.map((item, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden border border-white/10 shadow-lg shrink-0 ${item.className}`}
          >
            <Image
              src={item.src}
              alt={item.alt}
              fill
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
