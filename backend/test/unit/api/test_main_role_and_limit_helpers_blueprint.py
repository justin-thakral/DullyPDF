def test_role_limit_helpers_base_and_god_branching(app_main, mocker) -> None:
    mocker.patch.object(app_main, "_int_env", return_value=99)
    assert app_main._resolve_detect_max_pages("god") == 99
    assert app_main._resolve_fillable_max_pages("god") == 99
    assert app_main._resolve_saved_forms_limit("god") == 99
    assert app_main._resolve_fill_link_responses_monthly_limit("god") == 99
    assert app_main._resolve_template_api_active_limit("god") == 99
    assert app_main._resolve_template_api_requests_monthly_limit("god") == 99
    assert app_main._resolve_template_api_max_pages("god") == 99
    assert app_main._resolve_signing_requests_monthly_limit("god") == 99

    mocker.patch.object(app_main, "_int_env", return_value=5)
    assert app_main._resolve_detect_max_pages("base") == 5
    assert app_main._resolve_fillable_max_pages("base") == 5
    assert app_main._resolve_saved_forms_limit("base") == 5
    assert app_main._resolve_fill_link_responses_monthly_limit("base") == 5
    assert app_main._resolve_template_api_active_limit("base") == 5
    assert app_main._resolve_template_api_requests_monthly_limit("base") == 5
    assert app_main._resolve_template_api_max_pages("base") == 5
    assert app_main._resolve_signing_requests_monthly_limit("base") == 5


def test_role_limit_helpers_clamp_to_minimum_one(app_main, mocker) -> None:
    mocker.patch.object(app_main, "_int_env", return_value=0)
    assert app_main._resolve_detect_max_pages("base") == 1
    assert app_main._resolve_fillable_max_pages("base") == 1
    assert app_main._resolve_saved_forms_limit("base") == 1
    assert app_main._resolve_fill_link_responses_monthly_limit("base") == 0
    assert app_main._resolve_template_api_active_limit("base") == 0
    assert app_main._resolve_template_api_requests_monthly_limit("base") == 0
    assert app_main._resolve_template_api_max_pages("base") == 1
    assert app_main._resolve_signing_requests_monthly_limit("base") == 0

    mocker.patch.object(app_main, "_int_env", return_value=-10)
    assert app_main._resolve_detect_max_pages("god") == 1
    assert app_main._resolve_signing_requests_monthly_limit("god") == 0


def test_resolve_role_limits_aggregates_helpers(app_main, mocker) -> None:
    mocker.patch.object(app_main, "_resolve_detect_max_pages", return_value=7)
    mocker.patch.object(app_main, "_resolve_fillable_max_pages", return_value=55)
    mocker.patch.object(app_main, "_resolve_saved_forms_limit", return_value=4)
    mocker.patch.object(app_main, "_resolve_fill_link_responses_monthly_limit", return_value=25)
    mocker.patch.object(app_main, "_resolve_template_api_active_limit", return_value=2)
    mocker.patch.object(app_main, "_resolve_template_api_requests_monthly_limit", return_value=250)
    mocker.patch.object(app_main, "_resolve_template_api_max_pages", return_value=25)
    mocker.patch.object(app_main, "_resolve_signing_requests_monthly_limit", return_value=25)
    assert app_main._resolve_role_limits("base") == {
        "detectMaxPages": 7,
        "fillableMaxPages": 55,
        "savedFormsMax": 4,
        "fillLinkResponsesMonthlyMax": 25,
        "templateApiActiveMax": 2,
        "templateApiRequestsMonthlyMax": 250,
        "templateApiMaxPages": 25,
        "signingRequestsMonthlyMax": 25,
    }


def test_signing_request_monthly_limit_defaults_for_free_and_pro(app_main, monkeypatch) -> None:
    monkeypatch.delenv("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_BASE", raising=False)
    monkeypatch.delenv("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_PRO", raising=False)
    monkeypatch.delenv("SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_GOD", raising=False)

    assert app_main._resolve_signing_requests_monthly_limit("base") == 25
    assert app_main._resolve_signing_requests_monthly_limit("pro") == 10000
    assert app_main._resolve_signing_requests_monthly_limit("god") == 100000

def test_saved_forms_limit_defaults_for_free_pro_and_god(app_main, monkeypatch) -> None:
    monkeypatch.delenv("SANDBOX_SAVED_FORMS_MAX_BASE", raising=False)
    monkeypatch.delenv("SANDBOX_SAVED_FORMS_MAX_PRO", raising=False)
    monkeypatch.delenv("SANDBOX_SAVED_FORMS_MAX_GOD", raising=False)

    assert app_main._resolve_saved_forms_limit("base") == 5
    assert app_main._resolve_saved_forms_limit("pro") == 100
    assert app_main._resolve_saved_forms_limit("god") == 100


def test_resolve_role_limits_default_matrix_for_all_roles(app_main, monkeypatch) -> None:
    for env_name in (
        "SANDBOX_DETECT_MAX_PAGES_BASE",
        "SANDBOX_DETECT_MAX_PAGES_PRO",
        "SANDBOX_DETECT_MAX_PAGES_GOD",
        "SANDBOX_FILLABLE_MAX_PAGES_BASE",
        "SANDBOX_FILLABLE_MAX_PAGES_PRO",
        "SANDBOX_FILLABLE_MAX_PAGES_GOD",
        "SANDBOX_SAVED_FORMS_MAX_BASE",
        "SANDBOX_SAVED_FORMS_MAX_PRO",
        "SANDBOX_SAVED_FORMS_MAX_GOD",
        "SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_BASE",
        "SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_PRO",
        "SANDBOX_FILL_LINK_RESPONSES_MONTHLY_MAX_GOD",
        "SANDBOX_TEMPLATE_API_ACTIVE_MAX_BASE",
        "SANDBOX_TEMPLATE_API_ACTIVE_MAX_PRO",
        "SANDBOX_TEMPLATE_API_ACTIVE_MAX_GOD",
        "SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_BASE",
        "SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_PRO",
        "SANDBOX_TEMPLATE_API_REQUESTS_MONTHLY_MAX_GOD",
        "SANDBOX_TEMPLATE_API_MAX_PAGES_BASE",
        "SANDBOX_TEMPLATE_API_MAX_PAGES_PRO",
        "SANDBOX_TEMPLATE_API_MAX_PAGES_GOD",
        "SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_BASE",
        "SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_PRO",
        "SANDBOX_SIGNING_REQUESTS_MONTHLY_MAX_GOD",
    ):
        monkeypatch.delenv(env_name, raising=False)

    # Phase 5: templateApiMaxPages bumped from 25/250/1000 → 50/500/2000 so a
    # typical immigration packet (~30 pages across 8 forms) fits on the free
    # tier per-request limit.
    assert app_main._resolve_role_limits("base") == {
        "detectMaxPages": 5,
        "fillableMaxPages": 50,
        "savedFormsMax": 5,
        "fillLinkResponsesMonthlyMax": 25,
        "templateApiActiveMax": 1,
        "templateApiRequestsMonthlyMax": 250,
        "templateApiMaxPages": 50,
        "signingRequestsMonthlyMax": 25,
    }
    assert app_main._resolve_role_limits("pro") == {
        "detectMaxPages": 100,
        "fillableMaxPages": 1000,
        "savedFormsMax": 100,
        "fillLinkResponsesMonthlyMax": 10000,
        "templateApiActiveMax": 20,
        "templateApiRequestsMonthlyMax": 10000,
        "templateApiMaxPages": 500,
        "signingRequestsMonthlyMax": 10000,
    }
    assert app_main._resolve_role_limits("god") == {
        "detectMaxPages": 100,
        "fillableMaxPages": 1000,
        "savedFormsMax": 100,
        "fillLinkResponsesMonthlyMax": 100000,
        "templateApiActiveMax": 100,
        "templateApiRequestsMonthlyMax": 100000,
        "templateApiMaxPages": 2000,
        "signingRequestsMonthlyMax": 100000,
    }
