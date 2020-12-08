import React, {
  ChangeEvent,
  FC,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getPhoto,
  getTestimonials,
  getTestimonialsCount,
  goTo,
  postMetadata,
  postRender,
  postSubscriptions,
  postTestimonials,
  putPhoto,
} from '../api/httpClient';
import OwlCarousel from 'react-owl-carousel';
import 'owl.carousel/dist/assets/owl.carousel.css';
import 'owl.carousel/dist/assets/owl.theme.default.css';
import { Testimonial } from '../interfaces/Testimonial';
import { createImageUrl } from '../functions/createImageUrl';

const products = [
  {
    category: { name: 'Healing' },
    photos: [
      {
        url:
          '/api/file?path=config/products/crystals/amethyst.jpg&type=image/jpg',
      },
    ],
    name: 'Amethyst',
    short_description: 'a violet variety of quartz',
  },
  {
    category: { name: 'Gemstones' },
    photos: [
      {
        url: '/api/file?path=config/products/crystals/ruby.jpg&type=image/jpg',
      },
    ],
    name: 'Ruby',
    short_description: 'an intense heart crystal',
  },
  {
    category: { name: 'Healing' },
    photos: [
      {
        url: '/api/file?path=config/products/crystals/opal.jpg&type=image/jpg',
      },
    ],
    name: 'Opal',
    short_description: 'the precious stone',
  },
  {
    category: { name: 'Jewellery' },
    photos: [
      {
        url:
          '/api/file?path=config/products/crystals/sapphire.jpg&type=image/jpg',
      },
    ],
    name: 'Sapphire',
    short_description: '',
  },
  {
    category: { name: 'Gemstones' },
    photos: [
      {
        url:
          '/api/file?path=config/products/crystals/pyrite.jpg&type=image/jpg',
      },
    ],
    name: 'Pyrite',
    short_description: 'fools gold',
  },
  {
    category: { name: 'Healing' },
    photos: [
      {
        url: '/api/file?path=config/products/crystals/amber.jpg&type=image/jpg',
      },
    ],
    name: 'Amber',
    short_description: 'fossilized tree resin',
  },
  {
    category: { name: 'Jewellery' },
    photos: [
      {
        url:
          '/api/file?path=config/products/crystals/emerald.jpg&type=image/jpg',
      },
    ],
    name: 'Emerald',
    short_description: 'symbol of fertility and life',
  },
  {
    category: { name: 'Jewellery' },
    photos: [
      {
        url:
          '/api/file?path=config/products/crystals/shattuckite.jpg&type=image/jpg',
      },
    ],
    name: 'Shattuckite',
    short_description: 'mistery',
  },
  {
    category: { name: 'Gemstones' },
    photos: [
      {
        url:
          '/api/file?path=config/products/crystals/bismuth.jpg&type=image/jpg',
      },
    ],
    name: 'Bismuth',
    short_description: 'rainbow',
  },
];

const defaultTestimonial: Testimonial = {
  name: '',
  title: '',
  message: '',
};

export const Main: FC = () => {
  const [user, setUser] = useState<string | null>(
    sessionStorage.getItem('email'),
  );
  const [userImage, setUserImage] = useState<string>();

  const [testimonials, setTestimonials] = useState<Array<Testimonial>>([]);
  const [newTestimonial, setNewTestimonial] = useState<Testimonial>(
    defaultTestimonial,
  );
  const [testimonialsCount, setTestimonialsCount] = useState<number>(0);

  const [subscriptions, setSubscriptions] = useState<string>('');
  const [subscriptionsResponse, setSubscriptionsResponse] = useState<any>();

  const [phone, setPhone] = useState<string>('');

  useEffect(() => {
    getTestimonials().then((data) => setTestimonials(data));
    getTestimonialsCount().then((data) => setTestimonialsCount(data));
    postMetadata().then((data) => console.log('xml', data));
    postRender('+1 5589 55488 55').then((data) => setPhone(data));

    user &&
      getPhoto(user)
        .then(createImageUrl)
        .then((url) => setUserImage(url));
  }, [user]);

  const sendTestimonial = async (e: FormEvent) => {
    e.preventDefault();

    await postTestimonials(newTestimonial)
      .then((data) => {
        setTestimonials([...testimonials, data]);
        setNewTestimonial(defaultTestimonial);
      })
      .then(() =>
        getTestimonialsCount().then((data) => setTestimonialsCount(data)),
      )
      .catch((response) => {
        console.log('error', response);
      });
  };

  const sendPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file: File = (e.target.files as FileList)[0];
    file &&
      user &&
      putPhoto(file, user)
        .then(() =>
          getPhoto(user)
            .then(createImageUrl)
            .then((url) => setUserImage(url)),
        )
        .catch(({ response }) => {
          const { error } = response.data;
          console.log('error', error);
        });
  };

  const sendSubscription = (e: FormEvent) => {
    e.preventDefault();

    postSubscriptions(subscriptions)
      .then((data) => {
        setSubscriptionsResponse(data);
      })
      .catch(({ response }) => {
        const { error } = response.data;
        console.log('error', error);
      });
  };

  const logout = () => {
    sessionStorage.removeItem('email');
    setUser(null);
  };

  const sendGoTo = (url: string) => () => {
    goTo(url)
      .then((data) => console.log('data', data))
      .catch(({ response }) => {
        const { error } = response.data;
        console.log('error', error);
      });
  };

  const memoizedOwlCarousel = useMemo(
    () => (
      <OwlCarousel
        className="owl-carousel"
        dots
        responsive={{
          0: {
            items: 1,
          },
          768: {
            items: 2,
          },
          900: {
            items: 3,
          },
        }}
      >
        {testimonials.map((item, index) => (
          <div className="testimonial-item" key={item.name + index}>
            <p>
              <i className="bx bxs-quote-alt-left quote-icon-left" />
              <span dangerouslySetInnerHTML={{ __html: item.message }} />
              <i className="bx bxs-quote-alt-right quote-icon-right" />
            </p>
            <img
              src="assets/img/testimonials/testimonials-1.jpg"
              className="testimonial-img"
              alt=""
            />
            <h3 dangerouslySetInnerHTML={{ __html: item.name }} />
            <h4 dangerouslySetInnerHTML={{ __html: item.title }} />
          </div>
        ))}
      </OwlCarousel>
    ),
    [testimonials],
  );

  return (
    <>
      <header id="header" className="fixed-top ">
        <div className="container-fluid">
          <div className="row justify-content-center">
            <div className="col-xl-9 d-flex align-items-center">
              <a href="/" className="logo mr-auto" onClick={sendGoTo('/')}>
                <img src="assets/img/logo.png" alt="" className="img-fluid" />{' '}
                BROKEN CRYSTALS
              </a>

              <nav className="nav-menu d-none d-lg-block">
                <ul>
                  <li className="active">
                    <a href="/">Home</a>
                  </li>
                  <li>
                    <a href="/marketplace">Marketplace</a>
                  </li>
                  <li className="drop-down">
                    <a href="">Gemstones</a>
                    <ul>
                      <li>
                        <a href="/">Gemstone 1</a>
                      </li>
                      <li>
                        <a href="/">Gemstone 2</a>
                      </li>
                      <li>
                        <a href="/">Gemstone 3</a>
                      </li>
                      <li>
                        <a href="/">Gemstone 4</a>
                      </li>
                    </ul>
                  </li>
                  <li className="drop-down">
                    <a href="">Healing</a>
                    <ul>
                      <li>
                        <a href="/">Healing 1</a>
                      </li>
                      <li>
                        <a href="/">Healing 2</a>
                      </li>
                      <li>
                        <a href="/">Healing 3</a>
                      </li>
                      <li>
                        <a href="/">Healing 4</a>
                      </li>
                    </ul>
                  </li>
                  <li className="drop-down">
                    <a href="">Jewellery</a>
                    <ul>
                      <li>
                        <a href="/">Jewellery 1</a>
                      </li>
                      <li>
                        <a href="/">Jewellery 2</a>
                      </li>
                      <li>
                        <a href="/">Jewellery 3</a>
                      </li>
                      <li>
                        <a href="/">Jewellery 4</a>
                      </li>
                    </ul>
                  </li>
                  <li>
                    <a href="/contact">Contact</a>
                  </li>
                  <li>
                    <a href="/vulns">Vulnerabilities</a>
                  </li>
                </ul>
              </nav>
              {user ? (
                <>
                  <label
                    htmlFor="file-input"
                    style={{ cursor: 'pointer', display: 'contents' }}
                  >
                    <img
                      src={userImage || 'assets/img/profile.png'}
                      alt="user"
                      width={40}
                      height={40}
                      style={{ borderRadius: '50%', marginLeft: 25 }}
                    />
                  </label>
                  <a
                    href="/"
                    className="get-started-btn scrollto"
                    onClick={logout}
                  >
                    Log out {user}
                  </a>
                  <input
                    id="file-input"
                    type="file"
                    accept="image/x-png"
                    style={{ display: 'none' }}
                    onChange={sendPhoto}
                  />
                </>
              ) : (
                <a href="/login" className="get-started-btn scrollto">
                  Sign in
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <section id="hero" className="d-flex align-items-center">
        <div className="container-fluid" data-aos="fade-up">
          <div className="row justify-content-center">
            <div className="col-xl-5 col-lg-6 pt-3 pt-lg-0 order-2 order-lg-1 d-flex flex-column justify-content-center">
              <h1>Your Vulnerable Crystal Marketplace</h1>
              <h2>Find the most beautiful stones in one place!</h2>
              <div>
                <a href="#marketplace" className="btn-get-started scrollto">
                  Get Started
                </a>
              </div>
            </div>
            <div
              className="col-xl-4 col-lg-6 order-1 order-lg-2 hero-img"
              data-aos="zoom-in"
              data-aos-delay="150"
            >
              <img
                src="assets/img/hero-img.png"
                className="img-fluid animated"
                alt=""
              />
            </div>
          </div>
        </div>
      </section>

      <main id="main">
        <section id="marketplace" className="portfolio">
          <div className="container" data-aos="fade-up">
            <div className="section-title">
              <h2>Marketplace</h2>
            </div>

            <div className="row">
              <div className="col-lg-12 d-flex justify-content-center">
                <ul id="portfolio-flters">
                  <li data-filter="*" className="filter-active">
                    All
                  </li>
                  <li data-filter=".filter-Healing">Healing</li>
                  <li data-filter=".filter-Jewellery">Jewellery</li>
                  <li data-filter=".filter-Gemstones">Gemstones</li>
                </ul>
              </div>
            </div>

            <div className="row portfolio-container">
              {products.map((product) => (
                <div
                  className={`col-lg-4 col-md-6 portfolio-item filter-${product.category.name}`}
                  key={product.name}
                >
                  <div className="portfolio-wrap">
                    <img
                      src={product.photos[0].url}
                      className="img-fluid"
                      alt=""
                    />
                    <div className="portfolio-info">
                      <h4>{product.name}</h4>
                      <p>{product.short_description}</p>
                    </div>
                    <div className="portfolio-links">
                      <a
                        href={product.photos[0].url}
                        data-gall="portfolioGallery"
                        className="venobox"
                        title={product.name}
                      >
                        <i className="bx bx-plus" />
                      </a>
                      <a href="portfolio-details.html" title="More Details">
                        <i className="bx bx-link" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="counts" className="counts">
          <div className="container">
            <div className="row counters">
              <div className="col-lg-3 col-6 text-center">
                <span data-toggle="counter-up">154</span>
                <p>Crystals</p>
              </div>

              <div className="col-lg-3 col-6 text-center">
                <span data-toggle="counter-up">78</span>
                <p>Gemstones</p>
              </div>

              <div className="col-lg-3 col-6 text-center">
                <span data-toggle="counter-up">23</span>
                <p>Jewellery</p>
              </div>

              <div className="col-lg-3 col-6 text-center">
                <span data-toggle="counter-up">9</span>
                <p>Massage</p>
              </div>
            </div>
          </div>
        </section>

        <section id="testimonials" className="testimonials section-bg">
          <div className="container" data-aos="fade-up">
            <div className="section-title">
              <h2>Testimonials ({testimonialsCount})</h2>
              <p>
                Magnam dolores commodi suscipit. Necessitatibus eius consequatur
                ex aliquid fuga eum quidem. Sit sint consectetur velit. Quisquam
                quos quisquam cupiditate. Et nemo qui impedit suscipit alias ea.
                Quia fugiat sit in iste officiis commodi quidem hic quas.
              </p>
            </div>
            {testimonials && testimonials.length ? memoizedOwlCarousel : null}

            {/*{testimonials.length ? (*/}
            {/*  <OwlCarousel*/}
            {/*    className="owl-carousel"*/}
            {/*    dots*/}
            {/*    responsive={{*/}
            {/*      0: {*/}
            {/*        items: 1,*/}
            {/*      },*/}
            {/*      768: {*/}
            {/*        items: 2,*/}
            {/*      },*/}
            {/*      900: {*/}
            {/*        items: 3,*/}
            {/*      },*/}
            {/*    }}*/}
            {/*  >*/}
            {/*    {testimonialsItems(testimonials)}*/}

            {/*    /!*<div className="testimonial-item">*!/*/}
            {/*    /!*  <p>*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-left quote-icon-left" />*!/*/}
            {/*    /!*    Proin iaculis purus consequat sem cure digni ssim donec*!/*/}
            {/*    /!*    porttitora entum suscipit rhoncus. Accusantium quam,*!/*/}
            {/*    /!*    ultricies eget id, aliquam eget nibh et. Maecen aliquam,*!/*/}
            {/*    /!*    risus at semper.*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-right quote-icon-right" />*!/*/}
            {/*    /!*  </p>*!/*/}
            {/*    /!*  <img*!/*/}
            {/*    /!*    src="assets/img/testimonials/testimonials-1.jpg"*!/*/}
            {/*    /!*    className="testimonial-img"*!/*/}
            {/*    /!*    alt=""*!/*/}
            {/*    /!*  />*!/*/}
            {/*    /!*  <h3>Saul Goodman</h3>*!/*/}
            {/*    /!*  <h4>Ceo &amp; Founder</h4>*!/*/}
            {/*    /!*</div>*!/*/}

            {/*    /!*<div className="testimonial-item">*!/*/}
            {/*    /!*  <p>*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-left quote-icon-left" />*!/*/}
            {/*    /!*    Export tempor illum tamen malis malis eram quae irure esse*!/*/}
            {/*    /!*    labore quem cillum quid cillum eram malis quorum velit fore*!/*/}
            {/*    /!*    eram velit sunt aliqua noster fugiat irure amet legam anim*!/*/}
            {/*    /!*    culpa.*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-right quote-icon-right" />*!/*/}
            {/*    /!*  </p>*!/*/}
            {/*    /!*  <img*!/*/}
            {/*    /!*    src="assets/img/testimonials/testimonials-2.jpg"*!/*/}
            {/*    /!*    className="testimonial-img"*!/*/}
            {/*    /!*    alt=""*!/*/}
            {/*    /!*  />*!/*/}
            {/*    /!*  <h3>Sara Wilsson</h3>*!/*/}
            {/*    /!*  <h4>Designer</h4>*!/*/}
            {/*    /!*</div>*!/*/}

            {/*    /!*<div className="testimonial-item">*!/*/}
            {/*    /!*  <p>*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-left quote-icon-left" />*!/*/}
            {/*    /!*    Enim nisi quem export duis labore cillum quae magna enim*!/*/}
            {/*    /!*    sint quorum nulla quem veniam duis minim tempor labore quem*!/*/}
            {/*    /!*    eram duis noster aute amet eram fore quis sint minim.*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-right quote-icon-right" />*!/*/}
            {/*    /!*  </p>*!/*/}
            {/*    /!*  <img*!/*/}
            {/*    /!*    src="assets/img/testimonials/testimonials-3.jpg"*!/*/}
            {/*    /!*    className="testimonial-img"*!/*/}
            {/*    /!*    alt=""*!/*/}
            {/*    /!*  />*!/*/}
            {/*    /!*  <h3>Jena Karlis</h3>*!/*/}
            {/*    /!*  <h4>Store Owner</h4>*!/*/}
            {/*    /!*</div>*!/*/}

            {/*    /!*<div className="testimonial-item">*!/*/}
            {/*    /!*  <p>*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-left quote-icon-left" />*!/*/}
            {/*    /!*    Fugiat enim eram quae cillum dolore dolor amet nulla culpa*!/*/}
            {/*    /!*    multos export minim fugiat minim velit minim dolor enim duis*!/*/}
            {/*    /!*    veniam ipsum anim magna sunt elit fore quem dolore labore.*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-right quote-icon-right" />*!/*/}
            {/*    /!*  </p>*!/*/}
            {/*    /!*  <img*!/*/}
            {/*    /!*    src="assets/img/testimonials/testimonials-4.jpg"*!/*/}
            {/*    /!*    className="testimonial-img"*!/*/}
            {/*    /!*    alt=""*!/*/}
            {/*    /!*  />*!/*/}
            {/*    /!*  <h3>Matt Brandon</h3>*!/*/}
            {/*    /!*  <h4>Freelancer</h4>*!/*/}
            {/*    /!*</div>*!/*/}

            {/*    /!*<div className="testimonial-item">*!/*/}
            {/*    /!*  <p>*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-left quote-icon-left" />*!/*/}
            {/*    /!*    Quis quorum aliqua sint quem legam fore sunt eram irure*!/*/}
            {/*    /!*    aliqua veniam tempor noster veniam enim culpa labore duis*!/*/}
            {/*    /!*    sunt culpa nulla illum cillum fugiat legam esse veniam*!/*/}
            {/*    /!*    culpa.*!/*/}
            {/*    /!*    <i className="bx bxs-quote-alt-right quote-icon-right" />*!/*/}
            {/*    /!*  </p>*!/*/}
            {/*    /!*  <img*!/*/}
            {/*    /!*    src="assets/img/testimonials/testimonials-5.jpg"*!/*/}
            {/*    /!*    className="testimonial-img"*!/*/}
            {/*    /!*    alt=""*!/*/}
            {/*    /!*  />*!/*/}
            {/*    /!*  <h3>John Larson</h3>*!/*/}
            {/*    /!*  <h4>Entrepreneur</h4>*!/*/}
            {/*    /!*</div>*!/*/}
            {/*  </OwlCarousel>*/}
            {/*) : null}*/}

            {/*<div className="owl-carousel testimonials-carousel">*/}
            {/*  <div className="testimonial-item">*/}
            {/*    <p>*/}
            {/*      <i className="bx bxs-quote-alt-left quote-icon-left" />*/}
            {/*      Proin iaculis purus consequat sem cure digni ssim donec*/}
            {/*      porttitora entum suscipit rhoncus. Accusantium quam, ultricies*/}
            {/*      eget id, aliquam eget nibh et. Maecen aliquam, risus at*/}
            {/*      semper.*/}
            {/*      <i className="bx bxs-quote-alt-right quote-icon-right" />*/}
            {/*    </p>*/}
            {/*    <img*/}
            {/*      src="assets/img/testimonials/testimonials-1.jpg"*/}
            {/*      className="testimonial-img"*/}
            {/*      alt=""*/}
            {/*    />*/}
            {/*    <h3>Saul Goodman</h3>*/}
            {/*    <h4>Ceo &amp; Founder</h4>*/}
            {/*  </div>*/}

            {/*  <div className="testimonial-item">*/}
            {/*    <p>*/}
            {/*      <i className="bx bxs-quote-alt-left quote-icon-left" />*/}
            {/*      Export tempor illum tamen malis malis eram quae irure esse*/}
            {/*      labore quem cillum quid cillum eram malis quorum velit fore*/}
            {/*      eram velit sunt aliqua noster fugiat irure amet legam anim*/}
            {/*      culpa.*/}
            {/*      <i className="bx bxs-quote-alt-right quote-icon-right" />*/}
            {/*    </p>*/}
            {/*    <img*/}
            {/*      src="assets/img/testimonials/testimonials-2.jpg"*/}
            {/*      className="testimonial-img"*/}
            {/*      alt=""*/}
            {/*    />*/}
            {/*    <h3>Sara Wilsson</h3>*/}
            {/*    <h4>Designer</h4>*/}
            {/*  </div>*/}

            {/*  <div className="testimonial-item">*/}
            {/*    <p>*/}
            {/*      <i className="bx bxs-quote-alt-left quote-icon-left" />*/}
            {/*      Enim nisi quem export duis labore cillum quae magna enim sint*/}
            {/*      quorum nulla quem veniam duis minim tempor labore quem eram*/}
            {/*      duis noster aute amet eram fore quis sint minim.*/}
            {/*      <i className="bx bxs-quote-alt-right quote-icon-right" />*/}
            {/*    </p>*/}
            {/*    <img*/}
            {/*      src="assets/img/testimonials/testimonials-3.jpg"*/}
            {/*      className="testimonial-img"*/}
            {/*      alt=""*/}
            {/*    />*/}
            {/*    <h3>Jena Karlis</h3>*/}
            {/*    <h4>Store Owner</h4>*/}
            {/*  </div>*/}

            {/*  <div className="testimonial-item">*/}
            {/*    <p>*/}
            {/*      <i className="bx bxs-quote-alt-left quote-icon-left" />*/}
            {/*      Fugiat enim eram quae cillum dolore dolor amet nulla culpa*/}
            {/*      multos export minim fugiat minim velit minim dolor enim duis*/}
            {/*      veniam ipsum anim magna sunt elit fore quem dolore labore.*/}
            {/*      <i className="bx bxs-quote-alt-right quote-icon-right" />*/}
            {/*    </p>*/}
            {/*    <img*/}
            {/*      src="assets/img/testimonials/testimonials-4.jpg"*/}
            {/*      className="testimonial-img"*/}
            {/*      alt=""*/}
            {/*    />*/}
            {/*    <h3>Matt Brandon</h3>*/}
            {/*    <h4>Freelancer</h4>*/}
            {/*  </div>*/}

            {/*  <div className="testimonial-item">*/}
            {/*    <p>*/}
            {/*      <i className="bx bxs-quote-alt-left quote-icon-left" />*/}
            {/*      Quis quorum aliqua sint quem legam fore sunt eram irure aliqua*/}
            {/*      veniam tempor noster veniam enim culpa labore duis sunt culpa*/}
            {/*      nulla illum cillum fugiat legam esse veniam culpa.*/}
            {/*      <i className="bx bxs-quote-alt-right quote-icon-right" />*/}
            {/*    </p>*/}
            {/*    <img*/}
            {/*      src="assets/img/testimonials/testimonials-5.jpg"*/}
            {/*      className="testimonial-img"*/}
            {/*      alt=""*/}
            {/*    />*/}
            {/*    <h3>John Larson</h3>*/}
            {/*    <h4>Entrepreneur</h4>*/}
            {/*  </div>*/}
            {/*</div>*/}
          </div>

          {user && (
            <div className="container mt-5" data-aos="fade-up">
              <form role="form" onSubmit={sendTestimonial}>
                <div className="form-row">
                  <div className="col-md-6 form-group">
                    <input
                      type="text"
                      name="name"
                      className="form-control"
                      id="name"
                      placeholder="Your Name"
                      data-rule="minlen:4"
                      data-msg="Please enter at least 4 chars"
                      value={newTestimonial.name}
                      onInput={(e) =>
                        setNewTestimonial({
                          ...newTestimonial,
                          name: e.currentTarget.value,
                        })
                      }
                    />
                    <div className="validate" />
                  </div>
                  <div className="col-md-6 form-group">
                    <input
                      type="text"
                      className="form-control"
                      name="job-title"
                      id="job-title"
                      placeholder="Your Title"
                      data-rule="minlen:4"
                      data-msg="Please enter at least 4 chars"
                      value={newTestimonial.title}
                      onInput={(e) =>
                        setNewTestimonial({
                          ...newTestimonial,
                          title: e.currentTarget.value,
                        })
                      }
                    />
                    <div className="validate" />
                  </div>
                </div>
                <div className="form-group">
                  <textarea
                    className="form-control"
                    name="testimonial"
                    rows={5}
                    data-rule="required"
                    data-msg="Please write something for us"
                    placeholder="Testimonial"
                    value={newTestimonial.message}
                    onChange={(e) =>
                      setNewTestimonial({
                        ...newTestimonial,
                        message: e.currentTarget.value,
                      })
                    }
                  />
                  <div className="validate" />
                </div>
                <div className="text-center">
                  <button className="submit-testimonial" type="submit">
                    Send Testimonial
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        <section id="faq" className="faq">
          <div className="container" data-aos="fade-up">
            <div className="section-title">
              <h2>Frequently Asked Questions</h2>
              <p>
                Magnam dolores commodi suscipit. Necessitatibus eius consequatur
                ex aliquid fuga eum quidem. Sit sint consectetur velit. Quisquam
                quos quisquam cupiditate. Et nemo qui impedit suscipit alias ea.
                Quia fugiat sit in iste officiis commodi quidem hic quas.
              </p>
            </div>

            <div className="faq-list">
              <ul>
                <li data-aos="fade-up" data-aos-delay="100">
                  <i className="bx bx-help-circle icon-help" />{' '}
                  <a
                    data-toggle="collapse"
                    className="collapse"
                    href="#faq-list-1"
                  >
                    Non consectetur a erat nam at lectus urna duis?{' '}
                    <i className="bx bx-chevron-down icon-show" />
                    <i className="bx bx-chevron-up icon-close" />
                  </a>
                  <div
                    id="faq-list-1"
                    className="collapse show"
                    data-parent=".faq-list"
                  >
                    <p>
                      Feugiat pretium nibh ipsum consequat. Tempus iaculis urna
                      id volutpat lacus laoreet non curabitur gravida. Venenatis
                      lectus magna fringilla urna porttitor rhoncus dolor purus
                      non.
                    </p>
                  </div>
                </li>

                <li data-aos="fade-up" data-aos-delay="200">
                  <i className="bx bx-help-circle icon-help" />{' '}
                  <a
                    data-toggle="collapse"
                    href="#faq-list-2"
                    className="collapsed"
                  >
                    Feugiat scelerisque varius morbi enim nunc?{' '}
                    <i className="bx bx-chevron-down icon-show" />
                    <i className="bx bx-chevron-up icon-close" />
                  </a>
                  <div
                    id="faq-list-2"
                    className="collapse"
                    data-parent=".faq-list"
                  >
                    <p>
                      Dolor sit amet consectetur adipiscing elit pellentesque
                      habitant morbi. Id interdum velit laoreet id donec
                      ultrices. Fringilla phasellus faucibus scelerisque
                      eleifend donec pretium. Est pellentesque elit ullamcorper
                      dignissim. Mauris ultrices eros in cursus turpis massa
                      tincidunt dui.
                    </p>
                  </div>
                </li>

                <li data-aos="fade-up" data-aos-delay="300">
                  <i className="bx bx-help-circle icon-help" />{' '}
                  <a
                    data-toggle="collapse"
                    href="#faq-list-3"
                    className="collapsed"
                  >
                    Dolor sit amet consectetur adipiscing elit?{' '}
                    <i className="bx bx-chevron-down icon-show" />
                    <i className="bx bx-chevron-up icon-close" />
                  </a>
                  <div
                    id="faq-list-3"
                    className="collapse"
                    data-parent=".faq-list"
                  >
                    <p>
                      Eleifend mi in nulla posuere sollicitudin aliquam ultrices
                      sagittis orci. Faucibus pulvinar elementum integer enim.
                      Sem nulla pharetra diam sit amet nisl suscipit. Rutrum
                      tellus pellentesque eu tincidunt. Lectus urna duis
                      convallis convallis tellus. Urna molestie at elementum eu
                      facilisis sed odio morbi quis
                    </p>
                  </div>
                </li>

                <li data-aos="fade-up" data-aos-delay="400">
                  <i className="bx bx-help-circle icon-help" />{' '}
                  <a
                    data-toggle="collapse"
                    href="#faq-list-4"
                    className="collapsed"
                  >
                    Tempus quam pellentesque nec nam aliquam sem et tortor
                    consequat? <i className="bx bx-chevron-down icon-show" />
                    <i className="bx bx-chevron-up icon-close" />
                  </a>
                  <div
                    id="faq-list-4"
                    className="collapse"
                    data-parent=".faq-list"
                  >
                    <p>
                      Molestie a iaculis at erat pellentesque adipiscing
                      commodo. Dignissim suspendisse in est ante in. Nunc vel
                      risus commodo viverra maecenas accumsan. Sit amet nisl
                      suscipit adipiscing bibendum est. Purus gravida quis
                      blandit turpis cursus in.
                    </p>
                  </div>
                </li>

                <li data-aos="fade-up" data-aos-delay="500">
                  <i className="bx bx-help-circle icon-help" />{' '}
                  <a
                    data-toggle="collapse"
                    href="#faq-list-5"
                    className="collapsed"
                  >
                    Tortor vitae purus faucibus ornare. Varius vel pharetra vel
                    turpis nunc eget lorem dolor?{' '}
                    <i className="bx bx-chevron-down icon-show" />
                    <i className="bx bx-chevron-up icon-close" />
                  </a>
                  <div
                    id="faq-list-5"
                    className="collapse"
                    data-parent=".faq-list"
                  >
                    <p>
                      Laoreet sit amet cursus sit amet dictum sit amet justo.
                      Mauris vitae ultricies leo integer malesuada nunc vel.
                      Tincidunt eget nullam non nisi est sit amet. Turpis nunc
                      eget lorem dolor sed. Ut venenatis tellus in metus
                      vulputate eu scelerisque.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="contact" className="contact section-bg">
          <div className="container" data-aos="fade-up">
            <div className="section-title">
              <h2>Contact</h2>
              <p>
                Magnam dolores commodi suscipit. Necessitatibus eius consequatur
                ex aliquid fuga eum quidem. Sit sint consectetur velit. Quisquam
                quos quisquam cupiditate. Et nemo qui impedit suscipit alias ea.
                Quia fugiat sit in iste officiis commodi quidem hic quas.
              </p>
            </div>

            <div className="row">
              <div className="col-lg-6">
                <div className="info-box mb-4">
                  <i className="bx bx-map" />
                  <h3>Our Address</h3>
                  <p>A108 Adam Street, New York, NY 535022</p>
                </div>
              </div>

              <div className="col-lg-3 col-md-6">
                <div className="info-box  mb-4">
                  <i className="bx bx-envelope" />
                  <h3>Email Us</h3>
                  <p>contact@example.com</p>
                </div>
              </div>

              <div className="col-lg-3 col-md-6">
                <div className="info-box  mb-4">
                  <i className="bx bx-phone-call" />
                  <h3>Call Us</h3>
                  <p>+1 5589 55488 55</p>
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-lg-6 ">
                <iframe
                  className="mb-4 mb-lg-0"
                  src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d12097.433213460943!2d-74.0062269!3d40.7101282!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0xb89d1fe6bc499443!2sDowntown+Conference+Center!5e0!3m2!1smk!2sbg!4v1539943755621"
                  frameBorder="0"
                  style={{ border: 0, width: '100%', height: 384 }}
                  allowFullScreen
                />
              </div>

              <div className="col-lg-6">
                <form
                  action="forms/contact.php"
                  method="post"
                  role="form"
                  className="php-email-form"
                >
                  <div className="form-row">
                    <div className="col-md-6 form-group">
                      <input
                        type="text"
                        name="name"
                        className="form-control"
                        id="name"
                        placeholder="Your Name"
                        data-rule="minlen:4"
                        data-msg="Please enter at least 4 chars"
                      />
                      <div className="validate" />
                    </div>
                    <div className="col-md-6 form-group">
                      <input
                        type="email"
                        className="form-control"
                        name="email"
                        id="email"
                        placeholder="Your Email"
                        data-rule="email"
                        data-msg="Please enter a valid email"
                      />
                      <div className="validate" />
                    </div>
                  </div>
                  <div className="form-group">
                    <input
                      type="text"
                      className="form-control"
                      name="subject"
                      id="subject"
                      placeholder="Subject"
                      data-rule="minlen:4"
                      data-msg="Please enter at least 8 chars of subject"
                    />
                    <div className="validate" />
                  </div>
                  <div className="form-group">
                    <textarea
                      className="form-control"
                      name="message"
                      rows={5}
                      data-rule="required"
                      data-msg="Please write something for us"
                      placeholder="Message"
                    />
                    <div className="validate" />
                  </div>
                  <div className="mb-3">
                    <div className="loading">Loading</div>
                    <div className="error-message" />
                    <div className="sent-message">
                      Your message has been sent. Thank you!
                    </div>
                  </div>
                  <div className="text-center">
                    <button type="submit">Send Message</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer id="footer">
        <div className="footer-top">
          <div className="container">
            <div className="row">
              <div className="col-lg-3 col-md-6 footer-contact">
                <a href="/" className="logo mr-auto">
                  <img
                    width={100}
                    height={100}
                    src="assets/img/logo.png"
                    alt=""
                    className="img-fluid"
                  />
                </a>
                <h3>BROKEN CRYSTALS</h3>

                <p>
                  A108 Adam Street <br />
                  New York, NY 535022
                  <br />
                  United States <br />
                  <br />
                  <strong>Phone:</strong> {phone}
                  <br />
                  <strong>Email:</strong> info@example.com
                  <br />
                </p>
              </div>

              <div className="col-lg-2 col-md-6 footer-links">
                <h4>Useful Links</h4>
                <ul>
                  <li>
                    <i className="bx bx-chevron-right" /> <a href="/">Home</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">About us</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Services</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Terms of service</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Privacy policy</a>
                  </li>
                </ul>
              </div>

              <div className="col-lg-3 col-md-6 footer-links">
                <h4>Our Services</h4>
                <ul>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Web Design</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Web Development</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Product Management</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Marketing</a>
                  </li>
                  <li>
                    <i className="bx bx-chevron-right" />{' '}
                    <a href="/">Graphic Design</a>
                  </li>
                </ul>
              </div>

              <div className="col-lg-4 col-md-6 footer-newsletter">
                <h4>Join Our Newsletter</h4>
                <p>
                  Tamen quem nulla quae legam multos aute sint culpa legam
                  noster magna
                </p>
                <form onSubmit={sendSubscription}>
                  <input
                    type="input"
                    name="input"
                    value={subscriptions}
                    onInput={(e) => setSubscriptions(e.currentTarget.value)}
                  />
                  <input type="submit" value="Subscribe" />
                </form>
                {subscriptionsResponse && (
                  <span
                    className="dangerouslySetInnerHTML"
                    dangerouslySetInnerHTML={{
                      __html: subscriptionsResponse + ' subscribed.',
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="container">
          <div className="copyright-wrap d-md-flex py-4">
            <div className="mr-md-auto text-center text-md-left">
              <div className="copyright">
                &copy; Copyright{' '}
                <strong>
                  <span>Broken Crystals</span>
                </strong>
                . All Rights Reserved
              </div>
            </div>
            <div className="social-links text-center text-md-right pt-3 pt-md-0">
              <a href="/" className="twitter">
                <i className="bx bxl-twitter" />
              </a>
              <a href="/" className="facebook">
                <i className="bx bxl-facebook" />
              </a>
              <a href="/" className="instagram">
                <i className="bx bxl-instagram" />
              </a>
              <a href="/" className="google-plus">
                <i className="bx bxl-skype" />
              </a>
              <a href="/" className="linkedin">
                <i className="bx bxl-linkedin" />
              </a>
            </div>
          </div>
        </div>
      </footer>

      <a href="/" className="back-to-top">
        <i className="icofont-simple-up" />
      </a>
      <div id="preloader" />
    </>
  );
};

export default Main;
