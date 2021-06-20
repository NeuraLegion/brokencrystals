import React, { FC } from 'react';
import MarketplacePreview from './MarketplacePreview';
import Counts from './Counts';
import Hero from './Hero';
import Header from './Header/Header';
import FAQ from './FAQ';
import Contact from './Contact';
import Footer from './Footer';
import Testimonials from './Testimonials/Testimonials';

export const Main: FC = () => {
  return (
    <>
      <Header />
      <Hero />

      <main id="main">
        <MarketplacePreview />
        <Counts />
        <Testimonials />
        <FAQ />
        <Contact />
      </main>

      <Footer />

      <a href="/" className="back-to-top">
        <i className="icofont-simple-up" />
      </a>
      <div id="preloader" />
    </>
  );
};

export default Main;
