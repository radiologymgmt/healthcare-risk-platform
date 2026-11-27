# =============================================================================
# Global HTTPS Load Balancer + Google-Managed SSL Certificate for 4 Subdomains
# Routes:
#   intake.<demo_domain>   -> patient-web
#   mobile.<demo_domain>   -> patient-mobile-pwa
#   provider.<demo_domain> -> provider-dashboard
#   admin.<demo_domain>    -> admin-portal
# Activated automatically when var.demo_domain is non-empty.
# =============================================================================

locals {
  enable_lb = var.demo_domain != ""
  lb_hosts = local.enable_lb ? {
    intake   = "intake.${var.demo_domain}"
    mobile   = "mobile.${var.demo_domain}"
    provider = "provider.${var.demo_domain}"
    admin    = "admin.${var.demo_domain}"
  } : {}
}

resource "google_compute_global_address" "lb_ip" {
  count = local.enable_lb ? 1 : 0
  name  = "${local.prefix}-global-lb-ip"
}

resource "google_compute_managed_ssl_certificate" "demo_cert" {
  count = local.enable_lb ? 1 : 0
  name  = "${local.prefix}-managed-ssl-cert"

  managed {
    domains = [
      local.lb_hosts.intake,
      local.lb_hosts.mobile,
      local.lb_hosts.provider,
      local.lb_hosts.admin,
    ]
  }
}

resource "google_compute_url_map" "https_routes" {
  count           = local.enable_lb ? 1 : 0
  name            = "${local.prefix}-https-url-map"
  default_service = google_compute_backend_service.frontend_backend["patient-web"].id

  host_rule {
    hosts        = [local.lb_hosts.intake]
    path_matcher = "intake"
  }
  path_matcher {
    name            = "intake"
    default_service = google_compute_backend_service.frontend_backend["patient-web"].id
  }

  host_rule {
    hosts        = [local.lb_hosts.mobile]
    path_matcher = "mobile"
  }
  path_matcher {
    name            = "mobile"
    default_service = google_compute_backend_service.frontend_backend["patient-mobile-pwa"].id
  }

  host_rule {
    hosts        = [local.lb_hosts.provider]
    path_matcher = "provider"
  }
  path_matcher {
    name            = "provider"
    default_service = google_compute_backend_service.frontend_backend["provider-dashboard"].id
  }

  host_rule {
    hosts        = [local.lb_hosts.admin]
    path_matcher = "admin"
  }
  path_matcher {
    name            = "admin"
    default_service = google_compute_backend_service.frontend_backend["admin-portal"].id
  }
}

resource "google_compute_target_https_proxy" "https_proxy" {
  count            = local.enable_lb ? 1 : 0
  name             = "${local.prefix}-https-proxy"
  url_map          = google_compute_url_map.https_routes[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.demo_cert[0].id]
}

resource "google_compute_global_forwarding_rule" "https_rule" {
  count                 = local.enable_lb ? 1 : 0
  name                  = "${local.prefix}-https-forwarding-rule"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "443"
  target                = google_compute_target_https_proxy.https_proxy[0].id
  ip_address            = google_compute_global_address.lb_ip[0].id
}

# HTTP (80) -> HTTPS (443) Redirect
resource "google_compute_url_map" "http_redirect" {
  count = local.enable_lb ? 1 : 0
  name  = "${local.prefix}-http-redirect"
  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "http_proxy" {
  count   = local.enable_lb ? 1 : 0
  name    = "${local.prefix}-http-proxy"
  url_map = google_compute_url_map.http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "http_rule" {
  count                 = local.enable_lb ? 1 : 0
  name                  = "${local.prefix}-http-forwarding-rule"
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "80"
  target                = google_compute_target_http_proxy.http_proxy[0].id
  ip_address            = google_compute_global_address.lb_ip[0].id
}
