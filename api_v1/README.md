<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Personal heatmap integration

The Flutter app opens **Sport → My heatmap** and calls the authenticated
`GET /activities/heatmap` endpoint. The API selects only the JWT owner's latest
20 activities having at least two GPS waypoints. It forwards only coordinates
and timestamps to the Python service at `HEATMAP_URL` (default
`http://heatmap:3041`). The existing `POST /activities/:id/waypoints` endpoint
populates routes; manually logged activities without waypoints do not appear.
No new database tables or migrations are needed.

The Compose `heatmap` service pulls the published `ghcr.io/campus-motion/trail-parcours:latest`
image built by `Campus-Motion/Trail-parcours`, is reachable only on the
private Compose network, and does not publish port 3041. Deploy with:

```sh
docker compose up -d --pull always heatmap api-server
```

Outside Compose set `HEATMAP_URL` to the private renderer origin. Never point it
at a third-party service: payloads contain personal GPS data. Do not forward
user JWTs to it. Keep existing authentication, HTTPS, body limits and gateway
rate limits enabled. Rate-limit `/activities/heatmap` at the gateway because
rendering is CPU-intensive; the renderer accepts one render at a time per worker.

A 200 response contains the renderer's PNG data URL, bounds, run/point counts,
resolution and saturation. 204 means no usable moving routes; 413 means over
100,000 GPS points; 503 means the renderer is unavailable or busy. Responses use
`Cache-Control: no-store`; routes and generated images are not persisted by this
flow. Refresh after deleting an activity to regenerate from current data.

Backend verification: `cd api_v1 && npm test -- --runInBand test/activities/heatmaps.spec.ts`
and `npm run build`. The Flutter and renderer changes must be deployed together
with this backend change before the feature is available to production users.

### FIT uploads

The import-enabled Python renderer must be deployed with the backend. After
signing in to a test account, `POST /activities/import-fit` accepts one multipart
`file` of up to 10 MiB. A valid FIT activity needs at least two timestamped GPS
records in the supported latitude range (-85, 85). The endpoint creates a private
`other` activity and saves GPS points in one transaction; parser or database
failure cannot leave a partial activity. Only coordinates and timestamps are
retained, not health metrics, raw FIT bytes or the original filename. Reimporting
creates another activity rather than silently replacing an earlier one.

`GET /activities/export` returns all of the JWT owner's activities and route
points. Imported points participate in the existing personal heatmap query and
are removed when their activity/account is deleted by existing cascade rules.
The app's demo mode must never pretend to import a real file; use a live test
backend for import validation. Keep file-size and rate limits at the gateway.

```sh
npm test -- --runInBand test/activities/fit-imports.spec.ts test/activities/heatmaps.spec.ts
```
