import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { WhyChooseUs } from "@/components/why-choose-us";
import { WelcomeSection } from "@/components/welcome-section";
import { ElevateJourney } from "@/components/elevate-journey";
import { Spotlight } from "@/components/spotlight";
import { BrandsHelped } from "@/components/brands-helped";
import { CommunityTestimonials } from "@/components/community-testimonials";
import { PhotoCollage } from "@/components/photo-collage";
import { YoutubeSeries } from "@/components/youtube-series";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-[#00a2ed] selection:text-white flex flex-col">
      <Navbar />
      <Hero />
      <WhyChooseUs />
      <WelcomeSection />
      <ElevateJourney />
      <Spotlight />
      <BrandsHelped />
      <CommunityTestimonials />
      <PhotoCollage />
      <YoutubeSeries />
      <Footer />
    </main>
  );
}
